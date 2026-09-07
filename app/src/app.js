'use strict';

const express = require('express');

const { PricingError, listPlans } = require('./lib/pricing');
const { SubscriptionStore } = require('./lib/store');
const { ValidationError } = require('./lib/validation');
const { createQuoteRouter, createSubscriptionRouter } = require('./routes/subscriptions');

const SERVICE_NAME = 'saas-multi-env-demo-api';

/**
 * Builds the Express app. Kept separate from the HTTP listener so tests can
 * mount it directly and the process entrypoint stays trivial.
 *
 * @param {{store?: SubscriptionStore}} [deps]
 */
function createApp(deps = {}) {
  const store = deps.store ?? new SubscriptionStore();
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  // --- Operational endpoints -------------------------------------------------
  // /healthz is the ALB target-group health check; /readyz is what the
  // post-deploy smoke test hits before a promotion is considered successful.

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', service: SERVICE_NAME, uptimeSeconds: Math.floor(process.uptime()) });
  });

  app.get('/readyz', (_req, res) => {
    res.json({
      status: 'ready',
      service: SERVICE_NAME,
      environment: process.env.APP_ENV ?? 'local',
      version: process.env.APP_VERSION ?? 'dev',
      dependencies: { subscriptionStore: 'ok' },
    });
  });

  // --- Business endpoints ----------------------------------------------------

  app.get('/api/v1/plans', (_req, res) => {
    res.json({ items: listPlans() });
  });

  app.use('/api/v1/subscriptions', createSubscriptionRouter(store));
  app.use('/api/v1/billing', createQuoteRouter());

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } });
  });

  // Central error translator: domain errors become 4xx, everything else 500.
  // Express identifies error handlers by arity, so all four params must stay.
  app.use((err, _req, res, _next) => {
    if (err instanceof ValidationError) {
      res.status(422).json({
        error: { code: err.code, message: err.message, details: err.details },
      });
      return;
    }
    if (err instanceof PricingError) {
      res.status(400).json({ error: { code: err.code, message: err.message } });
      return;
    }
    if (err && err.type === 'entity.parse.failed') {
      res.status(400).json({ error: { code: 'invalid_json', message: 'Request body is not valid JSON' } });
      return;
    }
    res.status(500).json({ error: { code: 'internal_error', message: 'Unexpected server error' } });
  });

  return app;
}

module.exports = { SERVICE_NAME, createApp };
