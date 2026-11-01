import { context, ROOT_CONTEXT, trace, type Span, type SpanContext, type Tracer } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { noopTelemetry, type Telemetry } from "@keystone/kernel";

export interface TelemetryOptions {
  serviceName?: string;
  /** Off unless asked for. An unconfigured bot must not start an SDK. */
  enabled?: boolean;
  /** Tests pass an InMemorySpanExporter; production passes OTLP. */
  exporter?: SpanExporter;
}

export interface TelemetryHandle extends Telemetry {
  readonly enabled: boolean;
  readonly exporter?: SpanExporter;
}

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

let contextManagerInstalled = false;

/**
 * Without an async context manager, `context.active()` is always empty and no
 * span is ever current — which silently breaks `traceparent()` and therefore
 * propagation into the queue. Install it once per process.
 */
function ensureContextManager(): void {
  if (contextManagerInstalled) return;
  try {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  } catch {
    // Another SDK already registered one; that is fine.
  }
  contextManagerInstalled = true;
}

export function parseTraceparent(value: string | undefined): SpanContext | undefined {
  if (!value) return undefined;
  const match = TRACEPARENT.exec(value);
  if (!match) return undefined;
  const [, traceId, spanId, flags] = match;
  if (!traceId || !spanId || !flags) return undefined;
  return { traceId, spanId, traceFlags: Number.parseInt(flags, 16), isRemote: true };
}

function formatTraceparent(span: Span): string | undefined {
  if (!span.isRecording()) return undefined;
  const spanContext = span.spanContext();
  const flags = spanContext.traceFlags.toString(16).padStart(2, "0");
  return `00-${spanContext.traceId}-${spanContext.spanId}-${flags}`;
}

/**
 * OpenTelemetry, wrapped down to four methods.
 *
 * Two rules from the plan are enforced here: tracing is off by default (no
 * provider, no exporter, no per-call allocation beyond a function call), and
 * the only coupling the rest of the codebase has is the `Telemetry` interface
 * in the kernel — not `@opentelemetry/*`.
 */
export function createTelemetry(options: TelemetryOptions = {}): TelemetryHandle {
  const enabled = options.enabled ?? Boolean(options.exporter);

  if (!enabled) {
    return { ...noopTelemetry, enabled: false };
  }

  ensureContextManager();

  const exporter = options.exporter ?? new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });

  const tracer: Tracer = provider.getTracer(options.serviceName ?? "keystone");

  async function run<T>(name: string, parent: SpanContext | undefined, fn: () => Promise<T>): Promise<T> {
    const parentContext = parent
      ? trace.setSpanContext(ROOT_CONTEXT, parent)
      : context.active();
    const span = tracer.startSpan(name, {}, parentContext);

    try {
      return await context.with(trace.setSpan(parentContext, span), fn);
    } catch (error) {
      const exception = error instanceof Error ? error : new Error(String(error));
      span.recordException(exception);
      throw error;
    } finally {
      span.end();
    }
  }

  return {
    enabled: true,
    exporter,
    withSpan(name, fn) {
      return run(name, undefined, fn);
    },
    withRemoteParent(name, traceparent, fn) {
      return run(name, parseTraceparent(traceparent), fn);
    },
    traceparent() {
      const span = trace.getSpan(context.active());
      return span ? formatTraceparent(span) : undefined;
    },
    async shutdown() {
      await provider.shutdown();
    },
  };
}

/**
 * The production exporter is loaded only when an operator configures an
 * endpoint, so a plain self-host never pays for the OTLP package at runtime.
 */
export async function createOtlpTelemetry(
  endpoint: string,
  serviceName = "keystone",
): Promise<TelemetryHandle> {
  const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");
  return createTelemetry({
    enabled: true,
    serviceName,
    exporter: new OTLPTraceExporter({ url: endpoint }),
  });
}

export interface TestTelemetry {
  telemetry: TelemetryHandle;
  spans(): { name: string; traceId: string; spanId: string; parentSpanId?: string }[];
}

/** In-memory tracing for tests: no collector, no network, real span tree. */
export function createTestTelemetry(serviceName = "test"): TestTelemetry {
  const exporter = new InMemorySpanExporter();
  const telemetry = createTelemetry({ enabled: true, exporter, serviceName });
  return {
    telemetry,
    spans: () =>
      exporter.getFinishedSpans().map((span) => ({
        name: span.name,
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId,
        parentSpanId: span.parentSpanContext?.spanId,
      })),
  };
}
