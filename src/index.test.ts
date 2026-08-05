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

  it('does not throw and does not register listeners when window is undefined', () => {
    vi.stubGlobal('window', undefined);

    expect(() =>
      initOtelBrowserErrors({
        endpoint: 'https://otlp.example.com/v1/traces',
        serviceName: 'test-app',
      }),
    ).not.toThrow();
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
