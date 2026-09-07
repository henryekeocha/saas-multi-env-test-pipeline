'use strict';

const { randomUUID } = require('node:crypto');

/**
 * Deliberately simple in-memory repository.
 *
 * The point of this repo is the delivery pipeline, not persistence — but the
 * API is written against this narrow interface so a real implementation
 * (DynamoDB, RDS, ...) could be dropped in without touching the routes.
 */
class SubscriptionStore {
  constructor() {
    /** @type {Map<string, object>} */
    this.items = new Map();
  }

  /** @param {object} attrs */
  create(attrs) {
    const now = new Date().toISOString();
    const record = {
      id: randomUUID(),
      status: 'active',
      createdAt: now,
      updatedAt: now,
      ...attrs,
    };
    this.items.set(record.id, record);
    return record;
  }

  /** @param {string} id */
  get(id) {
    return this.items.get(id) ?? null;
  }

  /** @param {{planId?:string}} [filter] */
  list(filter = {}) {
    const all = [...this.items.values()];
    const filtered = filter.planId ? all.filter((s) => s.planId === filter.planId) : all;
    return filtered.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  /**
   * @param {string} id
   * @param {object} patch
   */
  update(id, patch) {
    const existing = this.items.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.items.set(id, updated);
    return updated;
  }

  /** @param {string} id */
  remove(id) {
    return this.items.delete(id);
  }

  clear() {
    this.items.clear();
  }
}

module.exports = { SubscriptionStore };
