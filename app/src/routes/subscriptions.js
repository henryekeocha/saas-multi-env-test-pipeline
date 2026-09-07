'use strict';

const express = require('express');

const { classifyPlanChange, quote } = require('../lib/pricing');
const {
  parseQuoteRequest,
  parseSubscriptionCreate,
  parseSubscriptionUpdate,
} = require('../lib/validation');

/**
 * @param {import('../lib/store').SubscriptionStore} store
 */
function createSubscriptionRouter(store) {
  const router = express.Router();

  /** @param {object} record */
  const withPricing = (record) => ({
    ...record,
    price: quote({
      planId: record.planId,
      seats: record.seats,
      billingCycle: record.billingCycle,
      taxRateBps: record.taxRateBps,
    }),
  });

  router.get('/', (req, res) => {
    const planId = typeof req.query.planId === 'string' ? req.query.planId : undefined;
    const items = store.list({ planId }).map(withPricing);
    res.json({ items, count: items.length });
  });

  router.post('/', (req, res) => {
    const attrs = parseSubscriptionCreate(req.body);
    const record = store.create(attrs);
    res.status(201).location(`/api/v1/subscriptions/${record.id}`).json(withPricing(record));
  });

  router.get('/:id', (req, res) => {
    const record = store.get(req.params.id);
    if (!record) {
      res.status(404).json({ error: { code: 'not_found', message: 'Subscription not found' } });
      return;
    }
    res.json(withPricing(record));
  });

  router.patch('/:id', (req, res) => {
    const existing = store.get(req.params.id);
    if (!existing) {
      res.status(404).json({ error: { code: 'not_found', message: 'Subscription not found' } });
      return;
    }
    const patch = parseSubscriptionUpdate(req.body);
    const updated = store.update(req.params.id, patch);
    res.json({
      ...withPricing(updated),
      planChange: classifyPlanChange(existing.planId, updated.planId),
    });
  });

  router.delete('/:id', (req, res) => {
    const removed = store.remove(req.params.id);
    if (!removed) {
      res.status(404).json({ error: { code: 'not_found', message: 'Subscription not found' } });
      return;
    }
    res.status(204).end();
  });

  return router;
}

/** Stateless pricing endpoint — useful for "what would this cost?" flows. */
function createQuoteRouter() {
  const router = express.Router();

  router.post('/quote', (req, res) => {
    const input = parseQuoteRequest(req.body);
    res.json(quote(input));
  });

  return router;
}

module.exports = { createQuoteRouter, createSubscriptionRouter };
