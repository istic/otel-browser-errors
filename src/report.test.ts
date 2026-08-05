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
