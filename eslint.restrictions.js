// Shared ESLint restrictions for every JS workspace package.

/** Analytics / telemetry / error-reporting SDKs. The product ships zero telemetry. */
export const telemetryPatterns = [
  '@sentry/*',
  'posthog-js',
  'posthog-node',
  'mixpanel-browser',
  'mixpanel',
  '@amplitude/*',
  'amplitude-js',
  '@segment/*',
  'analytics-node',
  'firebase/analytics',
  '@firebase/analytics',
  'firebase/performance',
  '@vercel/analytics',
  '@vercel/speed-insights',
  'react-ga',
  'react-ga4',
  'react-ga*',
  '@datadog/*',
  'dd-trace',
  '@bugsnag/*',
  'logrocket',
  'hotjar',
  '@hotjar/*',
  '@fullstory/*',
  'newrelic',
  '@newrelic/*',
  'rollbar',
  'heap-api',
  '@logrocket/*',
];

export const telemetryMessage =
  'Telemetry, analytics and error-reporting SDKs are banned (zero-telemetry posture).';
