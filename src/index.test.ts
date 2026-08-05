import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as reportModule from './report';
import { initOtelBrowserErrors } from './index';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

  it('shuts down the previous provider before creating a new one on repeated init', () => {
    const shutdownSpy = vi.spyOn(WebTracerProvider.prototype, 'shutdown');

    initOtelBrowserErrors({
      endpoint: 'https://otlp.example.com/v1/traces',
      serviceName: 'test-app',
    });

    const callsBeforeSecondInit = shutdownSpy.mock.calls.length;

    initOtelBrowserErrors({
      endpoint: 'https://otlp.example.com/v1/traces',
      serviceName: 'test-app',
    });

    expect(shutdownSpy.mock.calls.length).toBe(callsBeforeSecondInit + 1);
  });

  it('does not throw and does not register listeners when window is undefined', async () => {
    // Reset the module registry and re-import fresh copies of './listeners' and
    // './index' for this test. This avoids cross-test pollution of index.ts's
    // module-level `unregisterListeners` closure (set by earlier tests that ran
    // with a real jsdom window), which would otherwise throw on
    // `unregisterListeners?.()` before the guard under test is ever reached and
    // mask what this test is meant to verify.
    vi.resetModules();
    vi.stubGlobal('window', undefined);

    const freshListenersModule = await import('./listeners');
    const registerSpy = vi.spyOn(freshListenersModule, 'registerGlobalListeners');
    const { initOtelBrowserErrors: freshInitOtelBrowserErrors } = await import('./index');

    expect(() =>
      freshInitOtelBrowserErrors({
        endpoint: 'https://otlp.example.com/v1/traces',
        serviceName: 'test-app',
      }),
    ).not.toThrow();

    expect(registerSpy).not.toHaveBeenCalled();
  });

  it('does not throw when provider construction fails', () => {
    vi.spyOn(WebTracerProvider.prototype, 'register').mockImplementation(() => {
      throw new Error('boom');
    });

    expect(() =>
      initOtelBrowserErrors({
        endpoint: 'https://otlp.example.com/v1/traces',
        serviceName: 'test-app',
      }),
    ).not.toThrow();
  });
});
