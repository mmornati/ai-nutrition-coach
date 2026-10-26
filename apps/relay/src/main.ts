// Starts the relay: reads the environment, opens the database, listens. Logs one line at start and
// nothing about any request (no address, no handle, no size, no path).

import { createServer } from 'node:http';
import { createRelay } from './app';
import { ConfigError, readConfig } from './config';
import { createServerKeys, loadServerSecret } from './keys';
import { openStore } from './store';

function main(): void {
  let config;
  try {
    config = readConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`relay: refusing to start: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
  const store = openStore(config.dataDir);
  const keys = createServerKeys(loadServerSecret(config.dataDir, config.serverSecret));
  const server = createServer(
    {
      requestTimeout: 60_000,
      headersTimeout: 15_000,
      keepAliveTimeout: 5_000,
      maxHeaderSize: 8192,
    },
    createRelay({
      config,
      store,
      keys,
      onError: (name) => console.error(`relay: internal error (${name})`),
    }),
  );
  server.listen(config.port, config.host, () => {
    console.log(`relay: listening on port ${config.port} (signup ${config.signup})`);
  });
  const stop = (): void => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main();
