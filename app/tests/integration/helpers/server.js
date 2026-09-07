'use strict';

const { createApp } = require('../../../src/app');

/**
 * Boots the real Express app on an ephemeral port and returns a small client
 * that talks to it over actual HTTP. Integration tests here exercise the
 * network path (JSON parsing, status codes, headers), not a mounted handler.
 */
async function startTestServer() {
  const app = createApp();
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1');
    s.once('listening', () => resolve(s));
    s.once('error', reject);
  });

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  /**
   * @param {string} path
   * @param {RequestInit & {json?: unknown}} [options]
   */
  const request = async (path, options = {}) => {
    const { json, headers, ...rest } = options;
    const response = await fetch(`${baseUrl}${path}`, {
      ...rest,
      headers: {
        ...(json === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers,
      },
      body: json === undefined ? rest.body : JSON.stringify(json),
    });

    const text = await response.text();
    let body = null;
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { status: response.status, headers: response.headers, body };
  };

  const close = () => new Promise((resolve) => server.close(resolve));

  return { baseUrl, close, request, server };
}

module.exports = { startTestServer };
