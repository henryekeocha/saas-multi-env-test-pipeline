'use strict';

/**
 * Two named projects so CI can run the fast unit suite on its own
 * (`npm run test:unit`) while the coverage gate below is evaluated over the
 * whole suite (`npm run test:coverage`).
 */
module.exports = {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
    },
  ],
  collectCoverageFrom: ['src/**/*.js', '!src/server.js'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov'],

  // The merge gate. Dropping below any of these numbers fails the run, which
  // fails the PR check, which blocks the merge.
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
    // Pricing is the money path: it is held to a higher bar than the average.
    './src/lib/pricing.js': {
      statements: 95,
      branches: 95,
      functions: 95,
      lines: 95,
    },
  },
};
