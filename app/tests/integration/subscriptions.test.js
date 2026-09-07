'use strict';

const { startTestServer } = require('./helpers/server');

describe('subscriptions API (over HTTP)', () => {
  /** @type {Awaited<ReturnType<typeof startTestServer>>} */
  let api;

  beforeAll(async () => {
    api = await startTestServer();
  });

  afterAll(async () => {
    await api.close();
  });

  /** @param {object} [overrides] */
  const createSubscription = (overrides = {}) =>
    api.request('/api/v1/subscriptions', {
      method: 'POST',
      json: { customerEmail: 'ops@example.com', planId: 'starter', seats: 5, ...overrides },
    });

  it('lists the plan catalogue', async () => {
    const res = await api.request('/api/v1/plans');
    expect(res.status).toBe(200);
    expect(res.body.items.map((p) => p.id)).toEqual(['free', 'starter', 'pro', 'enterprise']);
  });

  it('creates a subscription and returns a priced representation', async () => {
    const res = await createSubscription();

    expect(res.status).toBe(201);
    expect(res.headers.get('location')).toBe(`/api/v1/subscriptions/${res.body.id}`);
    expect(res.body).toMatchObject({
      customerEmail: 'ops@example.com',
      planId: 'starter',
      seats: 5,
      billingCycle: 'monthly',
      status: 'active',
    });
    expect(res.body.price).toMatchObject({ totalCents: 4900, currency: 'USD' });
  });

  it('round-trips a created subscription through GET', async () => {
    const created = await createSubscription({ planId: 'pro', seats: 25 });
    const res = await api.request(`/api/v1/subscriptions/${created.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    // 5 overage seats x $9.00, no discount tier reached.
    expect(res.body.price.totalCents).toBe(19900 + 4500);
  });

  it('filters the collection by plan', async () => {
    await createSubscription({ planId: 'enterprise', seats: 100 });
    const res = await api.request('/api/v1/subscriptions?planId=enterprise');

    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
    expect(res.body.items.every((s) => s.planId === 'enterprise')).toBe(true);
  });

  it('patches a subscription and reports the plan change direction', async () => {
    const created = await createSubscription({ planId: 'starter', seats: 5 });
    const res = await api.request(`/api/v1/subscriptions/${created.body.id}`, {
      method: 'PATCH',
      json: { planId: 'pro', seats: 20 },
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ planId: 'pro', seats: 20, planChange: 'upgrade' });
    expect(res.body.price.totalCents).toBe(19900);
    expect(res.body.updatedAt >= res.body.createdAt).toBe(true);
  });

  it('deletes a subscription and then 404s on it', async () => {
    const created = await createSubscription();
    const del = await api.request(`/api/v1/subscriptions/${created.body.id}`, { method: 'DELETE' });
    expect(del.status).toBe(204);
    expect(del.body).toBeNull();

    const after = await api.request(`/api/v1/subscriptions/${created.body.id}`);
    expect(after.status).toBe(404);
  });

  it('404s when patching or deleting an unknown id', async () => {
    const patch = await api.request('/api/v1/subscriptions/does-not-exist', {
      method: 'PATCH',
      json: { seats: 3 },
    });
    const del = await api.request('/api/v1/subscriptions/does-not-exist', { method: 'DELETE' });

    expect(patch.status).toBe(404);
    expect(del.status).toBe(404);
  });

  it('422s with per-field details on an invalid create', async () => {
    const res = await api.request('/api/v1/subscriptions', {
      method: 'POST',
      json: { customerEmail: 'nope', planId: 'platinum', seats: 0 },
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('validation_failed');
    expect(res.body.error.details.map((d) => d.field).sort()).toEqual([
      'customerEmail',
      'planId',
      'seats',
    ]);
  });

  it('422s on an empty patch body', async () => {
    const created = await createSubscription();
    const res = await api.request(`/api/v1/subscriptions/${created.body.id}`, {
      method: 'PATCH',
      json: {},
    });

    expect(res.status).toBe(422);
    expect(res.body.error.details[0].field).toBe('body');
  });

  it('400s when a valid request exceeds a plan seat limit', async () => {
    const res = await createSubscription({ planId: 'free', seats: 4 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('seat_limit_exceeded');
  });
});

describe('billing quote API (over HTTP)', () => {
  /** @type {Awaited<ReturnType<typeof startTestServer>>} */
  let api;

  beforeAll(async () => {
    api = await startTestServer();
  });

  afterAll(async () => {
    await api.close();
  });

  it('quotes an annual plan with tax', async () => {
    const res = await api.request('/api/v1/billing/quote', {
      method: 'POST',
      json: { planId: 'pro', seats: 20, billingCycle: 'annual', taxRateBps: 2000 },
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      periodsCharged: 10,
      recurringCents: 199000,
      taxCents: 39800,
      totalCents: 238800,
    });
  });

  it('quotes a mid-cycle upgrade with a proration credit', async () => {
    const res = await api.request('/api/v1/billing/quote', {
      method: 'POST',
      json: {
        planId: 'pro',
        seats: 20,
        proration: { fromPlanId: 'starter', fromSeats: 5, daysRemaining: 15, daysInPeriod: 30 },
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.prorationCreditCents).toBe(2450);
    expect(res.body.totalCents).toBe(19900 - 2450);
  });

  it('422s on an invalid proration block', async () => {
    const res = await api.request('/api/v1/billing/quote', {
      method: 'POST',
      json: {
        planId: 'pro',
        seats: 20,
        proration: { fromPlanId: 'gold', fromSeats: 0, daysRemaining: -1, daysInPeriod: 0 },
      },
    });

    expect(res.status).toBe(422);
    expect(res.body.error.details).toHaveLength(4);
  });
});
