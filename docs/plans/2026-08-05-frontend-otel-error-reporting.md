# Frontend OTEL Error Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Bloom (and future Laravel apps) visibility into browser-side JS errors by publishing a small framework-agnostic npm package, `@istic-co/otel-browser-errors`, that reports errors to SigNoz via OTLP/HTTP trace spans, then wiring it into Bloom.

**Architecture:** A new standalone repo (`istic/otel-browser-errors`) exports `initOtelBrowserErrors(config)` (sets up a `WebTracerProvider` + OTLP exporter, registers `window.error`/`unhandledrejection` listeners) and `reportError(error, extraContext)` (records an exception on a short-lived `frontend.error` span). Bloom consumes the published package, calling `initOtelBrowserErrors` once in `resources/js/app.tsx` and `reportError` from `ErrorBoundary.componentDidCatch`.

**Tech Stack:** TypeScript, `@opentelemetry/sdk-trace-web`, `@opentelemetry/exporter-trace-otlp-http`, tsup (build), vitest (tests), npm (`@istic-co` scope).

**Spec:** `docs/superpowers/specs/2026-08-05-frontend-otel-error-reporting-design.md`

---

## Phase A: `istic/otel-browser-errors` package

### Task 1: Create the GitHub repo

**⚠️ PAUSE HERE and get explicit user go-ahead before running these commands** — creating a new public GitHub repo is a hard-to-reverse, externally-visible action.

- [ ] **Step 1: Create the repo**

```bash
gh repo create istic/otel-browser-errors --public --description "Framework-agnostic browser error/exception reporting to SigNoz via OpenTelemetry OTLP/HTTP" --clone
cd otel-browser-errors
```

- [ ] **Step 2: Add a LICENSE (MIT, matching Bloom's composer.json convention)**

```bash
cat > LICENSE <<'EOF'
MIT License

Copyright (c) 2026 istic

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
EOF
```

- [ ] **Step 3: Create a working branch (never commit to main directly)**

```bash
git checkout -b setup/scaffold-package
```

- [ ] **Step 4: Commit the LICENSE**

```bash
git add LICENSE
git commit -m "Add MIT license"
```

### Task 2: Scaffold package.json, TypeScript, and build config

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `.gitignore`
- Create: `.npmrc`

- [ ] **Step 1: Init package.json**

```bash
npm init -y
npm pkg set name="@istic-co/otel-browser-errors"
npm pkg set version="0.1.0"
npm pkg set description="Framework-agnostic browser error/exception reporting to SigNoz via OpenTelemetry OTLP/HTTP"
npm pkg set type="module"
npm pkg set main="./dist/index.cjs"
npm pkg set module="./dist/index.js"
npm pkg set types="./dist/index.d.ts"
npm pkg set license="MIT"
npm pkg set files[0]="dist"
npm pkg set exports["."].import="./dist/index.js"
npm pkg set exports["."].require="./dist/index.cjs"
npm pkg set exports["."].types="./dist/index.d.ts"
npm pkg set scripts.build="tsup"
npm pkg set scripts.test="vitest run"
npm pkg set scripts.typecheck="tsc --noEmit"
```

- [ ] **Step 2: Install runtime and dev dependencies**

```bash
npm install @opentelemetry/api @opentelemetry/resources @opentelemetry/sdk-trace-base @opentelemetry/sdk-trace-web @opentelemetry/exporter-trace-otlp-http @opentelemetry/semantic-conventions
npm install --save-dev typescript tsup vitest @vitest/coverage-v8 jsdom
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "declaration": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Write `tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
});
```

- [ ] **Step 5: Write `.gitignore`**

```
node_modules
dist
*.log
```

- [ ] **Step 6: Write `.npmrc` to scope publishes correctly**

```
access=public
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsup.config.ts .gitignore .npmrc
git commit -m "Scaffold package config, TypeScript, and build tooling"
```

### Task 3: `reportError` — the core reporting function

**Files:**
- Create: `src/report.ts`
- Test: `src/report.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/report.test.ts
import { SpanStatusCode } from '@opentelemetry/api';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { configureReporter, reportError, resetReporterForTests } from './report';

let exporter: InMemorySpanExporter;
let provider: WebTracerProvider;

beforeEach(() => {
  exporter = new InMemorySpanExporter();
  provider = new WebTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
});

afterEach(() => {
  resetReporterForTests();
});

describe('reportError', () => {
  it('does nothing when the reporter has not been configured', () => {
    reportError(new Error('boom'));
    expect(exporter.getFinishedSpans()).toHaveLength(0);
  });

  it('records an exception span with the error message', () => {
    configureReporter(provider.getTracer('test'));

    reportError(new Error('boom'));

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe('frontend.error');
    expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[0].status.message).toBe('boom');
    expect(spans[0].events[0].name).toBe('exception');
  });

  it('normalizes non-Error values into an Error', () => {
    configureReporter(provider.getTracer('test'));

    reportError('a plain string rejection');

    const spans = exporter.getFinishedSpans();
    expect(spans[0].status.message).toBe('a plain string rejection');
  });

  it('attaches context from the configured getContext callback, called fresh per report', () => {
    let route = '/first-page';
    configureReporter(provider.getTracer('test'), () => ({ route, userId: '42' }));

    reportError(new Error('first'));
    route = '/second-page';
    reportError(new Error('second'));

    const spans = exporter.getFinishedSpans();
    expect(spans[0].attributes.route).toBe('/first-page');
    expect(spans[1].attributes.route).toBe('/second-page');
    expect(spans[1].attributes.userId).toBe('42');
  });

  it('merges extraContext passed directly into reportError', () => {
    configureReporter(provider.getTracer('test'));

    reportError(new Error('boom'), { componentStack: 'at Foo\nat Bar' });

    const spans = exporter.getFinishedSpans();
    expect(spans[0].attributes.componentStack).toBe('at Foo\nat Bar');
  });

  it('omits undefined values returned from getContext', () => {
    configureReporter(provider.getTracer('test'), () => ({ userId: undefined }));

    reportError(new Error('boom'));

    const spans = exporter.getFinishedSpans();
    expect(spans[0].attributes.userId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/report.test.ts`
Expected: FAIL — `Cannot find module './report'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```ts
// src/report.ts
import { SpanStatusCode, type Tracer } from '@opentelemetry/api';

export type ContextGetter = () => Record<string, string | undefined>;

let activeTracer: Tracer | null = null;
let activeGetContext: ContextGetter = () => ({});

export function configureReporter(tracer: Tracer, getContext?: ContextGetter): void {
  activeTracer = tracer;
  activeGetContext = getContext ?? (() => ({}));
}

export function resetReporterForTests(): void {
  activeTracer = null;
  activeGetContext = () => ({});
}

export function reportError(
  error: unknown,
  extraContext: Record<string, string> = {},
): void {
  if (!activeTracer) {
    return;
  }

  const normalizedError = error instanceof Error ? error : new Error(String(error));
  const span = activeTracer.startSpan('frontend.error');

  for (const [key, value] of Object.entries(activeGetContext())) {
    if (value !== undefined) {
      span.setAttribute(key, value);
    }
  }

  for (const [key, value] of Object.entries(extraContext)) {
    span.setAttribute(key, value);
  }

  span.setAttribute('user_agent', navigator.userAgent);
  span.recordException(normalizedError);
  span.setStatus({ code: SpanStatusCode.ERROR, message: normalizedError.message });
  span.end();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/report.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/report.ts src/report.test.ts
git commit -m "Add reportError with span-based exception reporting"
```

### Task 4: Global `window` error listeners

**Files:**
- Create: `src/listeners.ts`
- Test: `src/listeners.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/listeners.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerGlobalListeners } from './listeners';
import * as reportModule from './report';

let unregister: () => void;

beforeEach(() => {
  vi.spyOn(reportModule, 'reportError').mockImplementation(() => {});
  unregister = registerGlobalListeners();
});

afterEach(() => {
  unregister();
  vi.restoreAllMocks();
});

describe('registerGlobalListeners', () => {
  it('reports the error object from a window error event', () => {
    const error = new Error('uncaught');
    window.dispatchEvent(new ErrorEvent('error', { error }));

    expect(reportModule.reportError).toHaveBeenCalledWith(error);
  });

  it('falls back to the event message when no error object is present', () => {
    window.dispatchEvent(new ErrorEvent('error', { message: 'script error' }));

    expect(reportModule.reportError).toHaveBeenCalledWith('script error');
  });

  it('reports the rejection reason from an unhandledrejection event', () => {
    const reason = new Error('rejected');
    const event = new Event('unhandledrejection') as PromiseRejectionEvent;
    Object.defineProperty(event, 'reason', { value: reason });
    window.dispatchEvent(event);

    expect(reportModule.reportError).toHaveBeenCalledWith(reason);
  });

  it('stops reporting after the returned unregister function is called', () => {
    unregister();
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('after unregister') }));

    expect(reportModule.reportError).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/listeners.test.ts`
Expected: FAIL — `Cannot find module './listeners'`

- [ ] **Step 3: Write the implementation**

```ts
// src/listeners.ts
import { reportError } from './report';

export function registerGlobalListeners(): () => void {
  const handleError = (event: ErrorEvent): void => {
    reportError(event.error ?? event.message);
  };

  const handleRejection = (event: PromiseRejectionEvent): void => {
    reportError(event.reason);
  };

  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleRejection);

  return () => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleRejection);
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/listeners.test.ts`
Expected: PASS (4 tests)

Note: the test mocks `reportModule.reportError` via `vi.spyOn` on the module namespace — this requires `listeners.ts` to call `reportError` as an imported binding (as written above), which vitest can spy on for ESM modules. If the spy doesn't intercept the call, switch the test to instead assert on `InMemorySpanExporter` output the way `report.test.ts` does, calling `configureReporter` first.

- [ ] **Step 5: Commit**

```bash
git add src/listeners.ts src/listeners.test.ts
git commit -m "Add global window error/unhandledrejection listeners"
```

### Task 5: `initOtelBrowserErrors` — public init entrypoint

**Files:**
- Create: `src/index.ts`
- Test: `src/index.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/index.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as reportModule from './report';
import { initOtelBrowserErrors } from './index';

afterEach(() => {
  vi.restoreAllMocks();
  reportModule.resetReporterForTests();
});

describe('initOtelBrowserErrors', () => {
  it('does not throw and does not configure a reporter when endpoint is empty', () => {
    const configureSpy = vi.spyOn(reportModule, 'configureReporter');

    expect(() => initOtelBrowserErrors({ endpoint: '', serviceName: 'test-app' })).not.toThrow();
    expect(configureSpy).not.toHaveBeenCalled();
  });

  it('does not throw and does not configure a reporter when endpoint is undefined', () => {
    const configureSpy = vi.spyOn(reportModule, 'configureReporter');

    expect(() =>
      initOtelBrowserErrors({ endpoint: undefined, serviceName: 'test-app' }),
    ).not.toThrow();
    expect(configureSpy).not.toHaveBeenCalled();
  });

  it('configures the reporter with a tracer and the provided getContext when endpoint is set', () => {
    const configureSpy = vi.spyOn(reportModule, 'configureReporter');
    const getContext = () => ({ route: '/' });

    initOtelBrowserErrors({
      endpoint: 'https://otlp.example.com/v1/traces',
      serviceName: 'test-app',
      getContext,
    });

    expect(configureSpy).toHaveBeenCalledWith(expect.anything(), getContext);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/index.test.ts`
Expected: FAIL — `Cannot find module './index'`

- [ ] **Step 3: Write the implementation**

```ts
// src/index.ts
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { registerGlobalListeners } from './listeners';
import { configureReporter, type ContextGetter } from './report';

export { reportError } from './report';

export type InitOtelBrowserErrorsConfig = {
  /** OTLP/HTTP traces endpoint. Falsy = disabled (no-op). */
  endpoint: string | undefined;
  serviceName: string;
  serviceVersion?: string;
  getContext?: ContextGetter;
};

let unregisterListeners: (() => void) | null = null;

export function initOtelBrowserErrors(config: InitOtelBrowserErrorsConfig): void {
  if (!config.endpoint) {
    return;
  }

  const provider = new WebTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.serviceName,
      ...(config.serviceVersion ? { [ATTR_SERVICE_VERSION]: config.serviceVersion } : {}),
    }),
    spanProcessors: [
      new BatchSpanProcessor(new OTLPTraceExporter({ url: config.endpoint })),
    ],
  });

  provider.register();

  configureReporter(provider.getTracer('otel-browser-errors'), config.getContext);

  unregisterListeners?.();
  unregisterListeners = registerGlobalListeners();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/index.test.ts`
Expected: PASS (3 tests)

If `resourceFromAttributes` or the `spanProcessors` constructor option isn't exported by the installed `@opentelemetry/resources` / `@opentelemetry/sdk-trace-web` versions (OTel JS APIs shift between minor versions), run `npx tsc --noEmit` to see the exact type error, check `node_modules/@opentelemetry/resources/build/src/index.d.ts` (or the equivalent for `sdk-trace-web`) for the currently-exported factory/constructor shape, and adjust the call to match — the behavior (attach service name/version as resource attributes; register a batch processor with the OTLP exporter) is what matters, not the exact call spelling.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts src/index.test.ts
git commit -m "Add initOtelBrowserErrors public entrypoint"
```

### Task 6: Full test run, typecheck, and build verification

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (all tests from Tasks 3-5)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Build**

Run: `npx tsup`
Expected: `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts` created without errors

- [ ] **Step 4: Commit any fixes made during this verification pass**

```bash
git add -A
git commit -m "Fix typecheck/build issues found during verification" --allow-empty
```

(Use `--allow-empty` only if step 1-3 needed no fixes; otherwise omit it and commit the real changes.)

### Task 7: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write the README**

```markdown
# @istic-co/otel-browser-errors

Framework-agnostic browser error/exception reporting to SigNoz via OpenTelemetry OTLP/HTTP. Reports uncaught errors, unhandled promise rejections, and manually-caught errors (e.g. from a React error boundary) as `frontend.error` trace spans, so they show up in the same trace-correlated view as backend errors.

## Install

\`\`\`bash
npm install @istic-co/otel-browser-errors
\`\`\`

## Usage

\`\`\`ts
import { initOtelBrowserErrors, reportError } from '@istic-co/otel-browser-errors';

initOtelBrowserErrors({
  endpoint: import.meta.env.VITE_OTEL_EXPORTER_OTLP_ENDPOINT, // e.g. https://otlp.svc.istic.systems/v1/traces
  serviceName: 'my-app-frontend',
  serviceVersion: import.meta.env.VITE_APP_VERSION,
  getContext: () => ({
    route: window.location.pathname,
    userId: currentUser?.id,
  }),
});

// Anywhere you catch an error manually (e.g. a React ErrorBoundary):
reportError(error, { componentStack: info.componentStack });
\`\`\`

If `endpoint` is falsy, `initOtelBrowserErrors` is a no-op — safe to call unconditionally in local dev without an ingest endpoint configured.

Global `window.onerror` / `unhandledrejection` listeners are registered automatically once `initOtelBrowserErrors` runs with a valid endpoint — you don't need to call `reportError` for those cases, only for errors your own code catches (error boundaries, try/catch blocks, etc.).

## Development

\`\`\`bash
npm install
npm test
npm run typecheck
npm run build
\`\`\`
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Add README"
```

### Task 8: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "Add CI workflow"
```

### Task 9: Release workflow, Dependabot, and shared-workflows automerge

**Files:**
- Create: `.github/workflows/release.yml`
- Create: `.github/workflows/dependabot-auto-merge.yml`
- Create: `.github/workflows/auto-rebase-dependabot.yml`
- Create: `.github/dependabot.yml`

- [ ] **Step 1: Write the release workflow**

```yaml
name: Release

on:
  push:
    tags:
      - "v*.*.*"

permissions:
  contents: read
  id-token: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: "https://registry.npmjs.org"
          cache: npm

      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build

      - run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- [ ] **Step 2: Write the Dependabot auto-merge workflow**

```yaml
name: "[Auto] Merge Dependabot Updates"

on:
  pull_request:
    branches: [dependabot-updates]

permissions: {}

jobs:
  automerge:
    if: github.actor == 'dependabot[bot]'
    uses: istic/shared-workflows/.github/workflows/auto-merge-dependabot.yml@main
    permissions:
      pull-requests: write
      contents: write
```

- [ ] **Step 3: Write the Dependabot rebase workflow**

```yaml
name: "[Auto] Rebase dependabot-updates onto main"

on:
  schedule:
    - cron: "0 1 * * *"
  workflow_dispatch:

permissions: {}

jobs:
  rebase:
    uses: istic/shared-workflows/.github/workflows/auto-rebase-dependabot.yml@main
    permissions:
      contents: write
      pull-requests: write
    secrets:
      REBASE_TOKEN: ${{ secrets.REBASE_TOKEN }}
```

- [ ] **Step 4: Write `.github/dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    target-branch: "dependabot-updates"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    target-branch: "dependabot-updates"
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release.yml .github/workflows/dependabot-auto-merge.yml .github/workflows/auto-rebase-dependabot.yml .github/dependabot.yml
git commit -m "Add release and Dependabot automerge workflows"
```

Note: this repo doesn't have a `dependabot-make-release.yml`-equivalent weekly merge+release job like Bloom's, because there's no version-bump-on-schedule requirement here — releases are triggered by pushing a `v*.*.*` tag manually. If auto-releasing on `dependabot-updates` merges becomes desirable later, port Bloom's `dependabot-make-release.yml` pattern then.

### Task 10: Open a PR, review, and merge to main

- [ ] **Step 1: Push the branch and open a draft PR**

```bash
git push -u origin setup/scaffold-package
gh pr create --draft --title "Scaffold @istic-co/otel-browser-errors" --body "Initial package: reportError + initOtelBrowserErrors, tests, CI, release workflow, Dependabot automerge. See aquarion/bloom#272 and docs/superpowers/specs/2026-08-05-frontend-otel-error-reporting-design.md in aquarion/bloom for the design."
```

- [ ] **Step 2: Mark the PR ready and merge once CI passes**

```bash
gh pr checks --watch
gh pr ready
gh pr merge --squash
```

### Task 11: First publish

**⚠️ PAUSE HERE and get explicit user go-ahead before publishing** — a published npm package version can't be unpublished after 72 hours (npm policy), so this is effectively permanent.

- [ ] **Step 1: Confirm an `NPM_TOKEN` secret exists on the repo**

```bash
gh secret list --repo istic/otel-browser-errors
```

If `NPM_TOKEN` isn't listed, get an automation token from npmjs.com (scoped to the `@istic-co` org, publish access) and add it:

```bash
gh secret set NPM_TOKEN --repo istic/otel-browser-errors
```

- [ ] **Step 2: Tag and push v0.1.0**

```bash
git checkout main
git pull --ff-only
git tag v0.1.0
git push origin v0.1.0
```

- [ ] **Step 3: Watch the release workflow and confirm the package is live**

```bash
gh run watch --repo istic/otel-browser-errors
npm view @istic-co/otel-browser-errors version
```

Expected: prints `0.1.0`

---

## Phase B: Bloom integration

### Task 12: Add the dependency and env vars

**Files:**
- Modify: `package.json`
- Modify: `.env.example`

- [ ] **Step 1: Create a feature branch in Bloom**

```bash
git -C /home/aquarion/code/aquarion/bloom checkout main
git -C /home/aquarion/code/aquarion/bloom pull --ff-only
git -C /home/aquarion/code/aquarion/bloom checkout -b feature/frontend-otel-error-reporting
```

- [ ] **Step 2: Install the package**

```bash
cd /home/aquarion/code/aquarion/bloom
npm install @istic-co/otel-browser-errors
```

- [ ] **Step 3: Add env vars to `.env.example`**

Find the existing `VITE_APP_NAME="${APP_NAME}"` line (`.env.example:84`) and add immediately after it:

```
VITE_APP_VERSION="${APP_VERSION}"
VITE_OTEL_EXPORTER_OTLP_ENDPOINT=
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "🎇 Add @istic-co/otel-browser-errors dependency and env vars"
```

### Task 13: Wire `reportError` into `ErrorBoundary`

**Files:**
- Modify: `resources/js/components/ErrorBoundary.tsx`
- Modify: `resources/js/components/ErrorBoundary.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `resources/js/components/ErrorBoundary.test.tsx`, after the existing `import` lines:

```ts
import { reportError } from '@istic-co/otel-browser-errors';

vi.mock('@istic-co/otel-browser-errors', () => ({
    reportError: vi.fn(),
}));
```

Add a new test inside the `describe('ErrorBoundary', ...)` block, after the `'logs the error and component stack to console.error'` test:

```ts
    it('reports the error via reportError with the component stack', () => {
        render(
            <ErrorBoundary>
                <Bomb shouldThrow />
            </ErrorBoundary>,
        );

        expect(reportError).toHaveBeenCalledWith(
            expect.any(Error),
            { componentStack: expect.any(String) },
        );
    });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run resources/js/components/ErrorBoundary.test.tsx`
Expected: FAIL — `reportError` was not called (ErrorBoundary doesn't call it yet)

- [ ] **Step 3: Update `ErrorBoundary.tsx`**

```tsx
import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';
import { reportError } from '@istic-co/otel-browser-errors';

type Props = {
    children: ReactNode;
};

type State = {
    error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error(
            '[Bloom] Unhandled render error:',
            error,
            info.componentStack,
        );
        reportError(error, { componentStack: info.componentStack ?? '' });
    }

    render() {
        if (this.state.error) {
            return (
                <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center text-foreground">
                    <p className="font-semibold text-lg">
                        Something went wrong.
                    </p>
                    <button
                        type="button"
                        className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
                        onClick={() => window.location.reload()}
                    >
                        Reload page
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run resources/js/components/ErrorBoundary.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add resources/js/components/ErrorBoundary.tsx resources/js/components/ErrorBoundary.test.tsx
git commit -m "🎇 Report ErrorBoundary catches via otel-browser-errors"
```

### Task 14: Initialize the SDK in `app.tsx`

**Files:**
- Modify: `resources/js/app.tsx`

- [ ] **Step 1: Update `app.tsx`**

```tsx
import { createInertiaApp } from '@inertiajs/react';
import { initOtelBrowserErrors } from '@istic-co/otel-browser-errors';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { MatomoInit } from '@/components/MatomoInit';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { initializeTheme } from '@/hooks/use-appearance';
import AppLayout from '@/layouts/app-layout';
import AuthLayout from '@/layouts/auth-layout';

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

let currentUserId: string | undefined;
let currentRoute: string | undefined;

initOtelBrowserErrors({
    endpoint: import.meta.env.VITE_OTEL_EXPORTER_OTLP_ENDPOINT,
    serviceName: 'bloom-frontend',
    serviceVersion: import.meta.env.VITE_APP_VERSION,
    getContext: () => ({ route: currentRoute, userId: currentUserId }),
});

createInertiaApp({
    title: (title) => (title ? `${title} — ${appName}` : appName),
    layout: (name) => {
        switch (true) {
            case name === 'welcome':
            case name === 'feed':
                return null;
            case name.startsWith('auth/'):
                return AuthLayout;
            default:
                return AppLayout;
        }
    },
    strictMode: true,
    withApp(app, { page }) {
        currentRoute = page.url;
        currentUserId = (page.props.auth as { user?: { id: number } } | undefined)
            ?.user?.id?.toString();

        return (
            <ErrorBoundary>
                <TooltipProvider delayDuration={0}>
                    <MatomoInit matomo={page.props.matomo} />
                    {app}
                    <Toaster />
                </TooltipProvider>
            </ErrorBoundary>
        );
    },
    progress: {
        color: '#4B5563',
    },
});

// This will set light / dark mode on load...
initializeTheme();
```

`currentRoute`/`currentUserId` are module-level variables updated on every `withApp` render (which Inertia re-invokes on navigation), giving `getContext()` fresh values without polling `usePage()` from outside React (per the existing [[feedback_inertia_withapp_context]] gotcha: `withApp` children are outside Inertia's context, and `usePage()` isn't available at this scope).

Check `page.props.auth`'s actual shape against how it's typed elsewhere in the codebase (e.g. `resources/js/types/index.d.ts` or wherever `SharedData`/`auth` props are typed) before assuming `{ user?: { id: number } }` — adjust the cast to match.

- [ ] **Step 2: Verify manually — no automated test for this file**

`app.tsx` is the Inertia entry point; per this repo's convention it shouldn't hold testable logic beyond wiring (see CLAUDE.md: "don't define components in app.tsx entry file"). Verification for this task is:

```bash
npm run build
```

Expected: builds without TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add resources/js/app.tsx
git commit -m "🎇 Initialize otel-browser-errors in app.tsx"
```

### Task 15: Thread `APP_VERSION` into the Vite build (Dockerfile)

**Files:**
- Modify: `Dockerfile`

The current `Dockerfile` declares `ARG APP_VERSION=dev` at line 56 — *after* the `npm run build` step at line 41 — so `VITE_APP_VERSION` has no value to pick up at build time. Move the `ARG` declarations earlier and pass `VITE_APP_VERSION` into the build command.

- [ ] **Step 1: Move the version ARGs above the build stage**

Replace:

```dockerfile
ARG APP_ENV=production
ARG APP_NAME=Bloom
```

with:

```dockerfile
ARG APP_ENV=production
ARG APP_NAME=Bloom
ARG APP_VERSION=dev
ARG APP_PR_NUMBER=
ARG APP_BRANCH=
```

- [ ] **Step 2: Pass `VITE_APP_VERSION` into the build command**

Replace:

```dockerfile
    && APP_ENV=$APP_ENV VITE_APP_NAME=$APP_NAME npm run build \
```

with:

```dockerfile
    && APP_ENV=$APP_ENV VITE_APP_NAME=$APP_NAME VITE_APP_VERSION=$APP_VERSION npm run build \
```

- [ ] **Step 3: Remove the now-duplicate ARG declarations further down**

Replace:

```dockerfile
ARG APP_VERSION=dev
ARG APP_PR_NUMBER=
ARG APP_BRANCH=

ENV APP_VERSION=$APP_VERSION
```

with:

```dockerfile
ENV APP_VERSION=$APP_VERSION
```

- [ ] **Step 4: Verify the Dockerfile still builds**

Run: `docker build -t bloom-test --build-arg APP_VERSION=test-1.2.3 .`
Expected: build succeeds (per [[feedback_build_locally_before_ci]] — always build locally before pushing Dockerfile changes)

- [ ] **Step 5: Confirm the version reached the frontend bundle**

```bash
docker run --rm bloom-test grep -o 'test-1.2.3' /var/www/html/public/build/assets/app-*.js | head -1
```

Expected: prints `test-1.2.3` (confirms `VITE_APP_VERSION` was inlined into the built JS)

- [ ] **Step 6: Commit**

```bash
git add Dockerfile
git commit -m "🔄️ Thread APP_VERSION into the Vite build as VITE_APP_VERSION"
```

### Task 16: Full verification and PR

- [ ] **Step 1: Run the full frontend test suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 2: Run the full backend test suite**

Run: `php artisan test --compact`
Expected: PASS (unaffected by this change, but confirms nothing else broke)

- [ ] **Step 3: Lint**

```bash
npx eslint resources/js
vendor/bin/pint --dirty --format agent
```

Expected: no errors (or auto-fixed and re-verified)

- [ ] **Step 4: Push and open a draft PR**

```bash
git push -u origin feature/frontend-otel-error-reporting
gh pr create --draft --title "Add frontend OTEL error reporting" --body "$(cat <<'EOF'
## Summary
- Adds @istic-co/otel-browser-errors and wires it into app.tsx + ErrorBoundary
- Threads APP_VERSION into the Vite build so VITE_APP_VERSION matches the backend's reported version
- Closes #272

## Test plan
- [x] vitest run
- [x] php artisan test --compact
- [x] docker build + confirmed version string reaches the built JS bundle
- [ ] Verify errors actually arrive in SigNoz once deployed to staging (beta.bloomfeed.app) with VITE_OTEL_EXPORTER_OTLP_ENDPOINT set and CORS confirmed for that origin (see open question in the design spec)
EOF
)"
```

- [ ] **Step 5: Update the changelog**

Per [[project_changelog_maintenance]], add an entry to `resources/docs/changelog.md` (newest first) describing the frontend error reporting addition once this PR is ready to merge.

---

## Open items carried from the spec (not part of this plan's automated verification)

- Confirm `beta.bloomfeed.app` and Bloom's production origin are actually on `otlp.svc.istic.systems`'s CORS allow-list in `aquarion/autopelago` — this plan does not modify that repo. If missing, that's a separate autopelago PR.
- Set `VITE_OTEL_EXPORTER_OTLP_ENDPOINT` in the actual staging/production deploy environment (not just `.env.example`) — this is an infra/secrets task outside this repo's scope, likely in `aquarion/autopelago`'s `laravel_apps.yml` host vars.
