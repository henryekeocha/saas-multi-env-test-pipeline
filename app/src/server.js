'use strict';

const { createApp } = require('./app');

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const server = createApp().listen(port, host, () => {
  // eslint-disable-next-line no-console -- process startup log
  console.log(`[${process.env.APP_ENV ?? 'local'}] listening on http://${host}:${port}`);
});

const shutdown = (signal) => () => {
  // eslint-disable-next-line no-console -- process shutdown log
  console.log(`received ${signal}, closing server`);
  server.close(() => process.exit(0));
};

process.on('SIGTERM', shutdown('SIGTERM'));
process.on('SIGINT', shutdown('SIGINT'));
