'use strict';

/**
 * Billing/pricing engine for the demo SaaS.
 *
 * This is the "business logic worth unit testing" in this repo: plan
 * catalogue, seat overage tiers, annual discounting, mid-cycle proration
 * and tax. All money is handled in integer cents to avoid float drift.
 */

/** @typedef {'free'|'starter'|'pro'|'enterprise'} PlanId */
/** @typedef {'monthly'|'annual'} BillingCycle */

const PLANS = Object.freeze({
  free: Object.freeze({
    id: 'free',
    name: 'Free',
    monthlyBaseCents: 0,
    includedSeats: 3,
    perSeatCents: 0,
    maxSeats: 3,
    rank: 0,
  }),
  starter: Object.freeze({
    id: 'starter',
    name: 'Starter',
    monthlyBaseCents: 4900,
    includedSeats: 5,
    perSeatCents: 1200,
    maxSeats: 25,
    rank: 1,
  }),
  pro: Object.freeze({
    id: 'pro',
    name: 'Pro',
    monthlyBaseCents: 19900,
    includedSeats: 20,
    perSeatCents: 900,
    maxSeats: 200,
    rank: 2,
  }),
  enterprise: Object.freeze({
    id: 'enterprise',
    name: 'Enterprise',
    monthlyBaseCents: 79900,
    includedSeats: 100,
    perSeatCents: 600,
    maxSeats: 5000,
    rank: 3,
  }),
});

/** Annual billing is charged as 10 monthly periods (2 months free). */
const ANNUAL_MONTHS_CHARGED = 10;

/**
 * Volume discount applied to *overage seats only*, keyed by the number of
 * overage seats. Tiers are evaluated highest-threshold-first.
 */
const OVERAGE_DISCOUNT_TIERS = Object.freeze([
  Object.freeze({ minOverageSeats: 100, discountBps: 2500 }),
  Object.freeze({ minOverageSeats: 50, discountBps: 1500 }),
  Object.freeze({ minOverageSeats: 10, discountBps: 500 }),
]);

class PricingError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   */
  constructor(message, code) {
    super(message);
    this.name = 'PricingError';
    this.code = code;
  }
}

/**
 * @param {string} planId
 * @returns {typeof PLANS[PlanId]}
 */
function getPlan(planId) {
  const plan = PLANS[planId];
  if (!plan) {
    throw new PricingError(`Unknown plan: ${planId}`, 'unknown_plan');
  }
  return plan;
}

function listPlans() {
  return Object.values(PLANS);
}

/**
 * Banker-free, deterministic half-up rounding for integer cents.
 * @param {number} value
 */
function roundCents(value) {
  return Math.round(value + Number.EPSILON);
}

/**
 * Discount (in basis points) applied to overage seats for a given count.
 * @param {number} overageSeats
 */
function overageDiscountBps(overageSeats) {
  for (const tier of OVERAGE_DISCOUNT_TIERS) {
    if (overageSeats >= tier.minOverageSeats) {
      return tier.discountBps;
    }
  }
  return 0;
}

/**
 * Cost of a single monthly period for a plan at a given seat count.
 *
 * @param {object} input
 * @param {string} input.planId
 * @param {number} input.seats
 * @returns {{baseCents:number, overageSeats:number, overageCents:number,
 *            discountBps:number, discountCents:number, subtotalCents:number}}
 */
function monthlyCharge({ planId, seats }) {
  const plan = getPlan(planId);

  if (!Number.isInteger(seats) || seats < 1) {
    throw new PricingError('seats must be a positive integer', 'invalid_seats');
  }
  if (seats > plan.maxSeats) {
    throw new PricingError(
      `Plan ${plan.id} supports at most ${plan.maxSeats} seats`,
      'seat_limit_exceeded',
    );
  }

  const overageSeats = Math.max(0, seats - plan.includedSeats);
  const grossOverageCents = overageSeats * plan.perSeatCents;
  const discountBps = overageDiscountBps(overageSeats);
  const discountCents = roundCents((grossOverageCents * discountBps) / 10000);
  const overageCents = grossOverageCents - discountCents;

  return {
    baseCents: plan.monthlyBaseCents,
    overageSeats,
    overageCents,
    discountBps,
    discountCents,
    subtotalCents: plan.monthlyBaseCents + overageCents,
  };
}

/**
 * Fraction of the current billing period still unused.
 *
 * @param {number} daysRemaining
 * @param {number} daysInPeriod
 * @returns {number} a value in [0, 1]
 */
function prorationFactor(daysRemaining, daysInPeriod) {
  if (!Number.isInteger(daysInPeriod) || daysInPeriod < 1) {
    throw new PricingError('daysInPeriod must be a positive integer', 'invalid_period');
  }
  if (!Number.isInteger(daysRemaining) || daysRemaining < 0) {
    throw new PricingError('daysRemaining must be a non-negative integer', 'invalid_period');
  }
  if (daysRemaining > daysInPeriod) {
    throw new PricingError('daysRemaining cannot exceed daysInPeriod', 'invalid_period');
  }
  return daysRemaining / daysInPeriod;
}

/**
 * Full quote for a subscription.
 *
 * @param {object} input
 * @param {string} input.planId
 * @param {number} input.seats
 * @param {BillingCycle} [input.billingCycle]
 * @param {number} [input.taxRateBps] tax rate in basis points (e.g. 2000 = 20%)
 * @param {object} [input.proration] optional mid-cycle change
 * @param {string} input.proration.fromPlanId plan currently being paid for
 * @param {number} input.proration.fromSeats seats currently being paid for
 * @param {number} input.proration.daysRemaining unused days in the period
 * @param {number} input.proration.daysInPeriod length of the period in days
 */
function quote({ planId, seats, billingCycle = 'monthly', taxRateBps = 0, proration }) {
  if (billingCycle !== 'monthly' && billingCycle !== 'annual') {
    throw new PricingError(`Unknown billing cycle: ${billingCycle}`, 'invalid_billing_cycle');
  }
  if (!Number.isInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10000) {
    throw new PricingError('taxRateBps must be an integer between 0 and 10000', 'invalid_tax_rate');
  }

  const monthly = monthlyCharge({ planId, seats });
  const periods = billingCycle === 'annual' ? ANNUAL_MONTHS_CHARGED : 1;
  const recurringCents = monthly.subtotalCents * periods;

  let creditCents = 0;
  if (proration) {
    const factor = prorationFactor(proration.daysRemaining, proration.daysInPeriod);
    const previous = monthlyCharge({
      planId: proration.fromPlanId,
      seats: proration.fromSeats,
    });
    creditCents = roundCents(previous.subtotalCents * factor);
  }

  // A credit can never exceed the new charge; the remainder is not refunded
  // in cash, it simply floors the invoice at zero.
  const appliedCreditCents = Math.min(creditCents, recurringCents);
  const netCents = recurringCents - appliedCreditCents;
  const taxCents = roundCents((netCents * taxRateBps) / 10000);

  return {
    planId,
    planName: getPlan(planId).name,
    seats,
    billingCycle,
    periodsCharged: periods,
    baseCents: monthly.baseCents,
    overageSeats: monthly.overageSeats,
    overageCents: monthly.overageCents,
    volumeDiscountBps: monthly.discountBps,
    volumeDiscountCents: monthly.discountCents,
    recurringCents,
    prorationCreditCents: appliedCreditCents,
    taxRateBps,
    taxCents,
    totalCents: netCents + taxCents,
    currency: 'USD',
  };
}

/**
 * Classifies a plan change so callers (and the API) can talk about it.
 * @param {string} fromPlanId
 * @param {string} toPlanId
 * @returns {'upgrade'|'downgrade'|'unchanged'}
 */
function classifyPlanChange(fromPlanId, toPlanId) {
  const from = getPlan(fromPlanId);
  const to = getPlan(toPlanId);
  if (to.rank > from.rank) return 'upgrade';
  if (to.rank < from.rank) return 'downgrade';
  return 'unchanged';
}

module.exports = {
  ANNUAL_MONTHS_CHARGED,
  OVERAGE_DISCOUNT_TIERS,
  PLANS,
  PricingError,
  classifyPlanChange,
  getPlan,
  listPlans,
  monthlyCharge,
  overageDiscountBps,
  prorationFactor,
  quote,
  roundCents,
};
