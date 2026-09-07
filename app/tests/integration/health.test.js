'use strict';

const { startTestServer } = require('./helpers/server');

describe('operational endpoints (over HTTP)', () => {
  /** @type {Awaited<ReturnType<typeof startTestServer>>} */
  let api;

  beforeAll(async () => {
    api = await startTestServer();
  });

  afterAll(async () => {
    await api.close();
  });

  it('serves GET /healthz — the ALB target-group health check', async () => {
    const res = await api.request('/healthz');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(res.body).toMatchObject({ status: 'ok', service: 'saas-multi-env-demo-api' });
    expect(typeof res.body.uptimeSeconds).toBe('number');
  });

  it('serves GET /readyz — the post-deploy smoke-test target', async () => {
    const res = await api.request('/readyz');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ready',
      dependencies: { subscriptionStore: 'ok' },
    });
    expect(res.body.environment).toBeDefined();
    expect(res.body.version).toBeDefined();
  });

  it('does not leak the framework via x-powered-by', async () => {
    const res = await api.request('/healthz');
    expect(res.headers.get('x-powered-by')).toBeNull();
  });

  it('returns a structured 404 for unknown routes', async () => {
    const res = await api.request('/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'not_found', message: 'Route not found' } });
  });

  it('rejects a malformed JSON body with a structured 400', async () => {
    const res = await api.request('/api/v1/subscriptions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_json');
  });
});
