# Frontend OpenTelemetry Error Reporting — Design Spec

Date: 2026-08-05
Status: Approved (pre-implementation)
Tracks: aquarion/bloom#272

## Problem

PHP errors already flow to SigNoz via OpenTelemetry (`open-telemetry/sdk` + `opentelemetry-auto-laravel`). Frontend (React) errors have zero visibility: a caught error just hits `console.error` in `ErrorBoundary.componentDidCatch` (`resources/js/components/ErrorBoundary.tsx`), and anything uncaught vanishes silently. This surfaced during the react/react-dom version-mismatch incident (#271): a fatal error on every page load in staging and production went unreported until someone happened to have devtools open.

`aquarion/bloom#272` was explicitly scoped to be reusable across multiple Laravel apps, not just Bloom-specific code.

## Blocking dependency status

`aquarion/autopelago#268` (public OTLP/HTTP ingest endpoint) is **closed/shipped**: `https://otlp.svc.istic.systems`, POST-only, CORS-locked to known app origins via `roles/firth_nginx/templates/nginx_confd/cors_otlp_ingest.conf`. Bloom's current staging origin (`https://beta.bloomfeed.app`, per `host_vars/firth.water.gkhs.net/laravel_apps.yml`) and production origin are both expected to be on that allow-list already — verify before relying on it in a deployed environment. #272 is unblocked.

## Decision: extract as a shared package, not inline Bloom code

Given #272's explicit reusability requirement, this ships as a new standalone package from day one rather than being built inline in Bloom and extracted later.

- New GitHub repo: `istic/otel-browser-errors`.
- Published to npm as `@istic-co/otel-browser-errors`.
- Framework-agnostic: no React/Inertia dependency in the package itself, so any of your Laravel apps (Inertia+React, or otherwise) can adopt it.

## Package design

### Dependencies
`@opentelemetry/sdk-trace-web`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/resources`, `@opentelemetry/api`.

### Reporting model
Each reported error becomes a short-lived span (`frontend.error`): `span.recordException(error)`, `span.setStatus({ code: SpanStatusCode.ERROR })`, then `span.end()`. Using trace spans (not log records) keeps errors correlatable with backend traces via `traceparent`/`tracestate` propagation headers — which is exactly what the nginx CORS config for the ingest endpoint already allows through (`Access-Control-Allow-Headers "content-type,traceparent,tracestate"`).

### Public API

```ts
initOtelBrowserErrors(config: {
  endpoint: string;             // e.g. https://otlp.svc.istic.systems/v1/traces
  serviceName: string;          // e.g. "bloom-frontend"
  serviceVersion?: string;
  getContext?: () => Record<string, string | undefined>; // called fresh per report
}): void;

reportError(error: unknown, extraContext?: Record<string, string>): void;
```

- `initOtelBrowserErrors` sets up the tracer provider/exporter and registers `window.addEventListener('error', ...)` and `window.addEventListener('unhandledrejection', ...)`, both funneling into the same internal report path as `reportError`.
- If `endpoint` is falsy, `initOtelBrowserErrors` no-ops entirely — supports disabling in local dev or any environment without an ingest endpoint configured.
- `navigator.userAgent` is captured automatically. Route, app version, and a non-PII user identifier come from the `getContext` callback, invoked fresh at report-time (not cached at init) so it reflects the current SPA state without the consuming app having to push updates into the package on every navigation.
- `reportError` is exported separately (not just wired to global listeners) so consuming apps can call it manually from their own error boundary/catch logic.

## Bloom integration

- `resources/js/app.tsx`: call `initOtelBrowserErrors({ endpoint: import.meta.env.VITE_OTEL_EXPORTER_OTLP_ENDPOINT, serviceName: 'bloom-frontend', serviceVersion: import.meta.env.VITE_APP_VERSION, getContext: () => ({ route: page.url, userId: page.props.auth?.user?.id }) })` before `createInertiaApp`.
- `ErrorBoundary.componentDidCatch` additionally calls `reportError(error, { componentStack: info.componentStack })`.
- New env vars:
  - `VITE_OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.svc.istic.systems/v1/traces` (empty/unset in local dev by default — no-op).
  - `VITE_APP_VERSION` — needs a delivery mechanism: the existing `APP_VERSION` build-arg (`config/version.php`, `Dockerfile`) is a runtime/server-side value; Vite env vars are baked in at build time. The Dockerfile's build stage needs `ARG APP_VERSION` threaded through to the Node/Vite build step as `VITE_APP_VERSION` so the frontend bundle gets the same version string the backend reports.
- No infra change needed for Bloom specifically — its origins are already expected to be on the CORS allow-list (verify at implementation time).

## Testing

- **Package** (vitest): `initOtelBrowserErrors` no-ops with empty endpoint; `reportError` produces a span with expected attributes and an exception event (assert via `InMemorySpanExporter` or equivalent test exporter); global `error`/`unhandledrejection` listeners fire the same report path when those events are dispatched synthetically.
- **Bloom** (vitest): extend `ErrorBoundary.test.tsx` to assert `reportError` is called on catch, mocking the package import.
- No new E2E/Dusk coverage — this is fire-and-forget telemetry with no user-visible behavior change.

## CI/CD (new repo)

- `.github/workflows/ci.yml`: install deps, `tsc --noEmit`, vitest, `tsup` build.
- `.github/workflows/release.yml`: on tag push, `npm publish --access public` to the `@istic-co` npm scope using an `NPM_TOKEN` repo secret.
- Same Dependabot-updates / auto-merge / auto-rebase pattern as Bloom, via `istic/shared-workflows` (see the `2026-08-05-laravel-starter-kit-design.md` spec for the exact workflow wiring this mirrors).

## Relationship to other issues

- **#273** (fallback UI for errors `ErrorBoundary` can't catch, e.g. failures during Inertia's initial `createRoot().render()`) is separate scope, but its later implementation should call this package's `reportError` too, per that issue's own note. Not part of this spec.
- **Laravel starter kit** (`2026-08-05-laravel-starter-kit-design.md`) deferred its OTEL component's frontend piece pending this package landing — once published, the starter kit's OTEL section should reference `@istic-co/otel-browser-errors` as the proven, reusable module rather than a bespoke design.

## Open questions / follow-ups

- Confirm Bloom's production and staging (`beta.bloomfeed.app`) origins are actually present in `cors_otlp_ingest.conf`'s allow-list before relying on delivery in those environments — not verified as part of this design session, only that the endpoint itself exists.
- Decide `npm publish` visibility (public vs restricted) for `@istic-co/otel-browser-errors` at implementation time.
