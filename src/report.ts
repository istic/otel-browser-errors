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
