import type { Telemetry } from "./types";

/**
 * The default telemetry: no SDK, no exporter, no allocations worth measuring.
 * P1's rule is that tracing must cost nothing until an operator configures it.
 */
export const noopTelemetry: Telemetry = {
  async withSpan(_name, fn) {
    return fn();
  },
  async withRemoteParent(_name, _traceparent, fn) {
    return fn();
  },
  traceparent() {
    return undefined;
  },
  async shutdown() {
    /* nothing to flush */
  },
};
