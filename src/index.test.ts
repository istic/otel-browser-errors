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
