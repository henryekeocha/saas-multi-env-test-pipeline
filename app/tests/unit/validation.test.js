'use strict';

const {
  ValidationError,
  isPlainObject,
  parseQuoteRequest,
  parseSubscriptionCreate,
  parseSubscriptionUpdate,
} = require('../../src/lib/validation');

/**
 * Collects the field names reported by a failing parse, so assertions stay
 * readable when several fields are wrong at once.
 * @param {() => unknown} fn
 */
function invalidFields(fn) {
  try {
    fn();
  } catch (err) {
    if (err instanceof ValidationError) {
      return err.details.map((d) => d.field).sort();
    }
    throw err;
  }
  throw new Error('expected a ValidationError to be thrown');
}

describe('isPlainObject', () => {
  it.each([
    [{}, true],
    [{ a: 1 }, true],
    [[], false],
    [null, false],
    ['string', false],
    [42, false],
  ])('classifies %p as %p', (value, expected) => {
    expect(isPlainObject(value)).toBe(expected);
  });
});

describe('parseSubscriptionCreate', () => {
  it('applies defaults for the optional fields', () => {
    expect(parseSubscriptionCreate({ customerEmail: 'a@b.io', planId: 'pro' })).toEqual({
      customerEmail: 'a@b.io',
      planId: 'pro',
      seats: 1,
      billingCycle: 'monthly',
      taxRateBps: 0,
    });
  });

  it('trims the customer email', () => {
    expect(parseSubscriptionCreate({ customerEmail: '  a@b.io  ', planId: 'free' })).toMatchObject({
      customerEmail: 'a@b.io',
    });
  });

  it('reports every invalid field at once', () => {
    expect(
      invalidFields(() =>
        parseSubscriptionCreate({
          customerEmail: 'not-an-email',
          planId: 'platinum',
          seats: 0,
          billingCycle: 'weekly',
          taxRateBps: 99999,
        }),
      ),
    ).toEqual(['billingCycle', 'customerEmail', 'planId', 'seats', 'taxRateBps']);
  });

  it.each([undefined, null, 'nope', []])('rejects a non-object body (%p)', (body) => {
    expect(() => parseSubscriptionCreate(body)).toThrow(ValidationError);
  });
});

describe('parseSubscriptionUpdate', () => {
  it('accepts a partial patch', () => {
    expect(parseSubscriptionUpdate({ seats: 12 })).toEqual({ seats: 12 });
    expect(parseSubscriptionUpdate({ planId: 'pro', billingCycle: 'annual' })).toEqual({
      planId: 'pro',
      billingCycle: 'annual',
    });
  });

  it('rejects an empty patch', () => {
    expect(invalidFields(() => parseSubscriptionUpdate({}))).toEqual(['body']);
  });

  it('rejects invalid values in an otherwise well-formed patch', () => {
    expect(
      invalidFields(() => parseSubscriptionUpdate({ planId: 'gold', seats: -2, billingCycle: 'daily' })),
    ).toEqual(['billingCycle', 'planId', 'seats']);
  });
});

describe('parseQuoteRequest', () => {
  it('parses a quote without proration', () => {
    expect(parseQuoteRequest({ planId: 'starter', seats: 7 })).toEqual({
      planId: 'starter',
      seats: 7,
      billingCycle: 'monthly',
      taxRateBps: 0,
      proration: undefined,
    });
  });

  it('parses a quote with proration', () => {
    expect(
      parseQuoteRequest({
        planId: 'pro',
        seats: 20,
        proration: { fromPlanId: 'starter', fromSeats: 5, daysRemaining: 10, daysInPeriod: 30 },
      }).proration,
    ).toEqual({ fromPlanId: 'starter', fromSeats: 5, daysRemaining: 10, daysInPeriod: 30 });
  });

  it('reports every invalid proration field', () => {
    expect(
      invalidFields(() =>
        parseQuoteRequest({
          planId: 'pro',
          seats: 20,
          proration: { fromPlanId: 'gold', fromSeats: 0, daysRemaining: -1, daysInPeriod: 0 },
        }),
      ),
    ).toEqual([
      'proration.daysInPeriod',
      'proration.daysRemaining',
      'proration.fromPlanId',
      'proration.fromSeats',
    ]);
  });

  it('rejects a non-object proration block', () => {
    expect(() => parseQuoteRequest({ planId: 'pro', seats: 20, proration: 'yes' })).toThrow(
      ValidationError,
    );
  });
});
