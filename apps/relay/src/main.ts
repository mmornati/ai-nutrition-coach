// Starts the relay: reads the environment, opens the database, listens. Logs one line at start and
// nothing about any request (no address, no handle, no size, no path).

import { createServer } from 'node:http';
import { runAdmin } from './admin';
import { createRelay } from './app';
import { ConfigError, readConfig, signupNotice } from './config';
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
  // `node relay.mjs admin ...`: the operator's tool, on this data directory, then exit.
  if (process.argv[2] === 'admin') {
    const code = runAdmin(process.argv.slice(3), {
      store,
      keys,
      now: Date.now,
      out: (text) => console.log(text),
      err: (text) => console.error(text),
    });
    store.close();
    process.exit(code);
  }
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
    const notice = signupNotice(config);
    if (notice !== null) console.log(notice);
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
