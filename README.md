# @istic-co/otel-browser-errors

Framework-agnostic browser error/exception reporting to SigNoz via OpenTelemetry OTLP/HTTP. Reports uncaught errors, unhandled promise rejections, and manually-caught errors (e.g. from a React error boundary) as `frontend.error` trace spans, so they show up in the same trace-correlated view as backend errors.

## Install

```bash
npm install @istic-co/otel-browser-errors
```

## Usage

```ts
import { initOtelBrowserErrors, reportError } from '@istic-co/otel-browser-errors';

initOtelBrowserErrors({
  endpoint: import.meta.env.VITE_OTEL_EXPORTER_OTLP_ENDPOINT, // e.g. https://otlp.svc.istic.systems/v1/traces
  serviceName: 'my-app-frontend',
  serviceVersion: import.meta.env.VITE_APP_VERSION,
  environment: import.meta.env.VITE_APP_ENV, // matches the backend's service.environment attribute
  revision: import.meta.env.VITE_APP_PR_NUMBER, // matches the backend's service.revision attribute
  branch: import.meta.env.VITE_APP_BRANCH, // matches the backend's service.branch attribute
  getContext: () => ({
    route: window.location.pathname,
    userId: currentUser?.id,
  }),
});

// Anywhere you catch an error manually (e.g. a React ErrorBoundary):
reportError(error, { componentStack: info.componentStack });
```

If `endpoint` is falsy, `initOtelBrowserErrors` is a no-op — safe to call unconditionally in local dev without an ingest endpoint configured.

Global `window.onerror` / `unhandledrejection` listeners are registered automatically once `initOtelBrowserErrors` runs with a valid endpoint — you don't need to call `reportError` for those cases, only for errors your own code catches (error boundaries, try/catch blocks, etc.).

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```
