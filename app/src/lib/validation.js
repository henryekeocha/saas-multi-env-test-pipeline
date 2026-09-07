'use strict';

const { PLANS } = require('./pricing');

class ValidationError extends Error {
  /**
   * @param {string} message
   * @param {Array<{field:string, message:string}>} [details]
   */
  constructor(message, details = []) {
    super(message);
    this.name = 'ValidationError';
    this.code = 'validation_failed';
    this.details = details;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const BILLING_CYCLES = ['monthly', 'annual'];

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates the payload for creating a subscription.
 *
 * @param {unknown} body
 * @returns {{customerEmail:string, planId:string, seats:number,
 *            billingCycle:string, taxRateBps:number}}
 */
function parseSubscriptionCreate(body) {
  const details = [];
  const input = isPlainObject(body) ? body : {};

  const customerEmail = typeof input.customerEmail === 'string' ? input.customerEmail.trim() : '';
  if (!EMAIL_RE.test(customerEmail)) {
    details.push({ field: 'customerEmail', message: 'must be a valid email address' });
  }

  const planId = typeof input.planId === 'string' ? input.planId : '';
  if (!Object.hasOwn(PLANS, planId)) {
    details.push({
      field: 'planId',
      message: `must be one of: ${Object.keys(PLANS).join(', ')}`,
    });
  }

  const seats = input.seats === undefined ? 1 : input.seats;
  if (!Number.isInteger(seats) || seats < 1) {
    details.push({ field: 'seats', message: 'must be a positive integer' });
  }

  const billingCycle = input.billingCycle === undefined ? 'monthly' : input.billingCycle;
  if (!BILLING_CYCLES.includes(billingCycle)) {
    details.push({
      field: 'billingCycle',
      message: `must be one of: ${BILLING_CYCLES.join(', ')}`,
    });
  }

  const taxRateBps = input.taxRateBps === undefined ? 0 : input.taxRateBps;
  if (!Number.isInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10000) {
    details.push({ field: 'taxRateBps', message: 'must be an integer between 0 and 10000' });
  }

  if (details.length > 0) {
    throw new ValidationError('Invalid subscription payload', details);
  }

  return { customerEmail, planId, seats, billingCycle, taxRateBps };
}

/**
 * Validates the payload for updating a subscription. Every field is optional,
 * but at least one must be present.
 *
 * @param {unknown} body
 */
function parseSubscriptionUpdate(body) {
  const details = [];
  const input = isPlainObject(body) ? body : {};
  /** @type {{planId?:string, seats?:number, billingCycle?:string}} */
  const patch = {};

  if (input.planId !== undefined) {
    if (typeof input.planId !== 'string' || !Object.hasOwn(PLANS, input.planId)) {
      details.push({
        field: 'planId',
        message: `must be one of: ${Object.keys(PLANS).join(', ')}`,
      });
    } else {
      patch.planId = input.planId;
    }
  }

  if (input.seats !== undefined) {
    if (!Number.isInteger(input.seats) || input.seats < 1) {
      details.push({ field: 'seats', message: 'must be a positive integer' });
    } else {
      patch.seats = input.seats;
    }
  }

  if (input.billingCycle !== undefined) {
    if (!BILLING_CYCLES.includes(input.billingCycle)) {
      details.push({
        field: 'billingCycle',
        message: `must be one of: ${BILLING_CYCLES.join(', ')}`,
      });
    } else {
      patch.billingCycle = input.billingCycle;
    }
  }

  if (details.length > 0) {
    throw new ValidationError('Invalid subscription patch', details);
  }
  if (Object.keys(patch).length === 0) {
    throw new ValidationError('Invalid subscription patch', [
      { field: 'body', message: 'must contain at least one of: planId, seats, billingCycle' },
    ]);
  }

  return patch;
}

/**
 * Validates the payload for an ad-hoc price quote.
 * @param {unknown} body
 */
function parseQuoteRequest(body) {
  const input = isPlainObject(body) ? body : {};
  const base = parseSubscriptionCreate({
    customerEmail: 'quote@example.com',
    planId: input.planId,
    seats: input.seats,
    billingCycle: input.billingCycle,
    taxRateBps: input.taxRateBps,
  });

  /** @type {undefined | {fromPlanId:string, fromSeats:number, daysRemaining:number, daysInPeriod:number}} */
  let proration;
  if (input.proration !== undefined) {
    const details = [];
    const p = isPlainObject(input.proration) ? input.proration : {};

    if (typeof p.fromPlanId !== 'string' || !Object.hasOwn(PLANS, p.fromPlanId)) {
      details.push({ field: 'proration.fromPlanId', message: 'must be a known plan id' });
    }
    if (!Number.isInteger(p.fromSeats) || p.fromSeats < 1) {
      details.push({ field: 'proration.fromSeats', message: 'must be a positive integer' });
    }
    if (!Number.isInteger(p.daysInPeriod) || p.daysInPeriod < 1) {
      details.push({ field: 'proration.daysInPeriod', message: 'must be a positive integer' });
    }
    if (!Number.isInteger(p.daysRemaining) || p.daysRemaining < 0) {
      details.push({ field: 'proration.daysRemaining', message: 'must be a non-negative integer' });
    }
    if (details.length > 0) {
      throw new ValidationError('Invalid quote payload', details);
    }
    proration = {
      fromPlanId: /** @type {string} */ (p.fromPlanId),
      fromSeats: /** @type {number} */ (p.fromSeats),
      daysRemaining: /** @type {number} */ (p.daysRemaining),
      daysInPeriod: /** @type {number} */ (p.daysInPeriod),
    };
  }

  return {
    planId: base.planId,
    seats: base.seats,
    billingCycle: base.billingCycle,
    taxRateBps: base.taxRateBps,
    proration,
  };
}

module.exports = {
  BILLING_CYCLES,
  ValidationError,
  isPlainObject,
  parseQuoteRequest,
  parseSubscriptionCreate,
  parseSubscriptionUpdate,
};
