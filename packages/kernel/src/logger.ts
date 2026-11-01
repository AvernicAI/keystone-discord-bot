import type { LogFields, Logger } from "./types";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type LogLevel = keyof typeof LEVELS;

/**
 * JSON-lines logger. One line per event keeps logs grep-able and lets P1 swap
 * the sink for OpenTelemetry without touching a single call site.
 */
function makeLogger(scope: string, minLevel: LogLevel): Logger {
  const write = (level: LogLevel, message: string, fields?: LogFields): void => {
    if (LEVELS[level] < LEVELS[minLevel]) return;
    const line = JSON.stringify({
      ...fields,
      time: new Date().toISOString(),
      level,
      scope,
      message,
    });
    const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
    stream.write(`${line}\n`);
  };

  return {
    debug: (message, fields) => write("debug", message, fields),
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    error: (message, fields) => write("error", message, fields),
    child: (childScope) => makeLogger(`${scope}:${childScope}`, minLevel),
  };
}

export function createLogger(scope: string, level: LogLevel = "info"): Logger {
  return makeLogger(scope, level);
}

/** Test double: keeps assertions quiet and memory-only. */
export function createSilentLogger(): Logger {
  const noop = (): void => {};
  const logger: Logger = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: () => logger,
  };
  return logger;
}
