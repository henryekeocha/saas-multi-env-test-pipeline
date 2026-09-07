'use strict';

const {
  ANNUAL_MONTHS_CHARGED,
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
} = require('../../src/lib/pricing');

describe('plan catalogue', () => {
  it('exposes every plan through listPlans()', () => {
    expect(listPlans().map((p) => p.id)).toEqual(['free', 'starter', 'pro', 'enterprise']);
  });

  it('returns a known plan by id', () => {
    expect(getPlan('pro')).toBe(PLANS.pro);
  });

  it('rejects an unknown plan id', () => {
    expect(() => getPlan('platinum')).toThrow(PricingError);
    expect(() => getPlan('platinum')).toThrow(/Unknown plan: platinum/);
  });
});

describe('roundCents', () => {
  it('rounds half up and leaves integers alone', () => {
    expect(roundCents(10.5)).toBe(11);
    expect(roundCents(10.4)).toBe(10);
    expect(roundCents(10)).toBe(10);
  });
});

describe('overageDiscountBps', () => {
  it.each([
    [0, 0],
    [9, 0],
    [10, 500],
    [49, 500],
    [50, 1500],
    [99, 1500],
    [100, 2500],
    [5000, 2500],
  ])('gives %i overage seats a %i bps discount', (seats, expected) => {
    expect(overageDiscountBps(seats)).toBe(expected);
  });
});

describe('monthlyCharge', () => {
  it('charges only the base fee when seats are within the included allowance', () => {
    expect(monthlyCharge({ planId: 'starter', seats: 5 })).toEqual({
      baseCents: 4900,
      overageSeats: 0,
      overageCents: 0,
      discountBps: 0,
      discountCents: 0,
      subtotalCents: 4900,
    });
  });

  it('adds undiscounted overage below the first discount tier', () => {
    // 3 overage seats x $12.00 = $36.00, no tier reached.
    expect(monthlyCharge({ planId: 'starter', seats: 8 })).toMatchObject({
      overageSeats: 3,
      discountBps: 0,
      overageCents: 3600,
      subtotalCents: 8500,
    });
  });

  it('applies the volume discount once a tier is reached', () => {
    // 10 overage seats x $12.00 = $120.00, less 5% = $114.00.
    expect(monthlyCharge({ planId: 'starter', seats: 15 })).toMatchObject({
      overageSeats: 10,
      discountBps: 500,
      discountCents: 600,
      overageCents: 11400,
      subtotalCents: 16300,
    });
  });

  it('applies the deepest tier for very large overages', () => {
    // 100 overage seats x $9.00 = $900.00, less 25% = $675.00.
    expect(monthlyCharge({ planId: 'pro', seats: 120 })).toMatchObject({
      overageSeats: 100,
      discountBps: 2500,
      discountCents: 22500,
      overageCents: 67500,
    });
  });

  it('keeps the free plan free', () => {
    expect(monthlyCharge({ planId: 'free', seats: 3 }).subtotalCents).toBe(0);
  });

  it.each([0, -1, 2.5, '4', null])('rejects an invalid seat count (%p)', (seats) => {
    expect(() => monthlyCharge({ planId: 'pro', seats })).toThrow(
      expect.objectContaining({ code: 'invalid_seats' }),
    );
  });

  it('rejects seats above the plan ceiling', () => {
    expect(() => monthlyCharge({ planId: 'free', seats: 4 })).toThrow(
      expect.objectContaining({ code: 'seat_limit_exceeded' }),
    );
  });
});

describe('prorationFactor', () => {
  it('returns the unused fraction of the period', () => {
    expect(prorationFactor(15, 30)).toBe(0.5);
    expect(prorationFactor(0, 30)).toBe(0);
    expect(prorationFactor(30, 30)).toBe(1);
  });

  it.each([
    [10, 0],
    [10, -1],
    [10, 1.5],
    [-1, 30],
    [1.5, 30],
    [31, 30],
  ])('rejects daysRemaining=%p daysInPeriod=%p', (remaining, period) => {
    expect(() => prorationFactor(remaining, period)).toThrow(
      expect.objectContaining({ code: 'invalid_period' }),
    );
  });
});

describe('quote', () => {
  it('quotes a simple monthly subscription', () => {
    expect(quote({ planId: 'starter', seats: 5 })).toMatchObject({
      planId: 'starter',
      planName: 'Starter',
      billingCycle: 'monthly',
      periodsCharged: 1,
      recurringCents: 4900,
      prorationCreditCents: 0,
      taxCents: 0,
      totalCents: 4900,
      currency: 'USD',
    });
  });

  it('charges annual plans for ten months', () => {
    const result = quote({ planId: 'pro', seats: 20, billingCycle: 'annual' });
    expect(result.periodsCharged).toBe(ANNUAL_MONTHS_CHARGED);
    expect(result.recurringCents).toBe(19900 * 10);
    expect(result.totalCents).toBe(19900 * 10);
  });

  it('adds tax to the net amount', () => {
    // $49.00 x 20% = $9.80.
    expect(quote({ planId: 'starter', seats: 5, taxRateBps: 2000 })).toMatchObject({
      taxCents: 980,
      totalCents: 5880,
    });
  });

  it('credits the unused portion of the previous plan on a mid-cycle upgrade', () => {
    // Half of a $49.00 Starter period = $24.50 credited against a $199.00 Pro period.
    const result = quote({
      planId: 'pro',
      seats: 20,
      proration: { fromPlanId: 'starter', fromSeats: 5, daysRemaining: 15, daysInPeriod: 30 },
    });
    expect(result.prorationCreditCents).toBe(2450);
    expect(result.totalCents).toBe(19900 - 2450);
  });

  it('taxes the amount net of the proration credit', () => {
    const result = quote({
      planId: 'pro',
      seats: 20,
      taxRateBps: 1000,
      proration: { fromPlanId: 'starter', fromSeats: 5, daysRemaining: 15, daysInPeriod: 30 },
    });
    expect(result.taxCents).toBe(Math.round((19900 - 2450) * 0.1));
    expect(result.totalCents).toBe(19900 - 2450 + result.taxCents);
  });

  it('never lets a credit push the invoice below zero', () => {
    // Downgrading from Enterprise to Free: the credit far exceeds the charge.
    const result = quote({
      planId: 'free',
      seats: 3,
      proration: { fromPlanId: 'enterprise', fromSeats: 100, daysRemaining: 30, daysInPeriod: 30 },
    });
    expect(result.prorationCreditCents).toBe(0);
    expect(result.totalCents).toBe(0);
  });

  it('rejects an unknown billing cycle', () => {
    expect(() => quote({ planId: 'pro', seats: 20, billingCycle: 'weekly' })).toThrow(
      expect.objectContaining({ code: 'invalid_billing_cycle' }),
    );
  });

  it.each([-1, 10001, 2.5, '2000'])('rejects an invalid tax rate (%p)', (taxRateBps) => {
    expect(() => quote({ planId: 'pro', seats: 20, taxRateBps })).toThrow(
      expect.objectContaining({ code: 'invalid_tax_rate' }),
    );
  });
});

describe('classifyPlanChange', () => {
  it.each([
    ['starter', 'pro', 'upgrade'],
    ['pro', 'starter', 'downgrade'],
    ['pro', 'pro', 'unchanged'],
    ['free', 'enterprise', 'upgrade'],
  ])('classifies %s -> %s as %s', (from, to, expected) => {
    expect(classifyPlanChange(from, to)).toBe(expected);
  });
});
