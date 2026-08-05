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
