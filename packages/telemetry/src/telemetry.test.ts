import { describe, expect, it } from "vitest";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { createTelemetry, parseTraceparent } from "./index";

describe("createTelemetry", () => {
  it("shares one trace id across command, database call and queued job", async () => {
    const exporter = new InMemorySpanExporter();
    const telemetry = createTelemetry({ enabled: true, exporter, serviceName: "test" });

    await telemetry.withSpan("command ping", async () => {
      await telemetry.withSpan("db.settings.get", async () => undefined);
      const traceparent = telemetry.traceparent();
      expect(traceparent).toBeDefined();

      await telemetry.withRemoteParent("job demo", traceparent, async () => undefined);
    });

    const spans = exporter.getFinishedSpans();
    expect(spans.map((span) => span.name).sort()).toEqual([
      "command ping",
      "db.settings.get",
      "job demo",
    ]);

    const command = spans.find((span) => span.name === "command ping")!;
    const database = spans.find((span) => span.name === "db.settings.get")!;
    const job = spans.find((span) => span.name === "job demo")!;

    expect(new Set(spans.map((span) => span.spanContext().traceId)).size).toBe(1);
    expect(database.parentSpanContext?.spanId).toBe(command.spanContext().spanId);
    expect(job.parentSpanContext?.spanId).toBe(command.spanContext().spanId);
  });

  it("costs nothing when disabled", async () => {
    const telemetry = createTelemetry();
    let ran = false;

    await telemetry.withSpan("noop", async () => {
      ran = true;
      expect(telemetry.traceparent()).toBeUndefined();
    });

    expect(telemetry.enabled).toBe(false);
    expect(telemetry.exporter).toBeUndefined();
    expect(ran).toBe(true);
    await telemetry.shutdown();
  });

  it("rejects a malformed traceparent instead of inventing a parent", () => {
    expect(parseTraceparent("not-a-trace")).toBeUndefined();
    expect(parseTraceparent(undefined)).toBeUndefined();
    expect(
      parseTraceparent("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")?.traceId,
    ).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
  });
});
