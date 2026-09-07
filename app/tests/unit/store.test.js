'use strict';

const { SubscriptionStore } = require('../../src/lib/store');

describe('SubscriptionStore', () => {
  /** @type {SubscriptionStore} */
  let store;

  beforeEach(() => {
    store = new SubscriptionStore();
  });

  it('assigns an id, status and timestamps on create', () => {
    const record = store.create({ planId: 'pro', seats: 20 });
    expect(record.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(record.status).toBe('active');
    expect(record.createdAt).toBe(record.updatedAt);
    expect(record).toMatchObject({ planId: 'pro', seats: 20 });
  });

  it('reads back a created record and returns null for unknown ids', () => {
    const record = store.create({ planId: 'free' });
    expect(store.get(record.id)).toEqual(record);
    expect(store.get('missing')).toBeNull();
  });

  it('lists records and filters by plan', () => {
    store.create({ planId: 'free' });
    store.create({ planId: 'pro' });
    store.create({ planId: 'pro' });

    expect(store.list()).toHaveLength(3);
    expect(store.list({ planId: 'pro' })).toHaveLength(2);
    expect(store.list({ planId: 'enterprise' })).toEqual([]);
  });

  it('merges a patch and bumps updatedAt', () => {
    const record = store.create({ planId: 'starter', seats: 5 });
    const updated = store.update(record.id, { seats: 9 });
    expect(updated).toMatchObject({ planId: 'starter', seats: 9 });
    expect(updated.createdAt).toBe(record.createdAt);
  });

  it('returns null when updating an unknown id', () => {
    expect(store.update('missing', { seats: 2 })).toBeNull();
  });

  it('removes records and reports whether anything was removed', () => {
    const record = store.create({ planId: 'free' });
    expect(store.remove(record.id)).toBe(true);
    expect(store.remove(record.id)).toBe(false);
    expect(store.get(record.id)).toBeNull();
  });

  it('clears every record', () => {
    store.create({ planId: 'free' });
    store.clear();
    expect(store.list()).toEqual([]);
  });
});
