/**
 * Lightweight structured logger.
 *
 * Emits JSON log lines for easier filtering/aggregation in production.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function normalizeLevel(value: string | undefined): LogLevel {
  switch (value?.toLowerCase()) {
    case "debug":
    case "info":
    case "warn":
    case "error":
      return value.toLowerCase() as LogLevel;
    default:
      return "info";
  }
}

function sanitizeMeta(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeMeta);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, sanitizeMeta(v)])
    );
  }

  return value;
}

export function createLogger(scope: string) {
  const minLevel = normalizeLevel(process.env.LOG_LEVEL);

  function write(level: LogLevel, message: string, meta?: Record<string, unknown>) {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minLevel]) {
      return;
    }

    const logLine = {
      timestamp: new Date().toISOString(),
      level,
      scope,
      message,
      meta: meta ? sanitizeMeta(meta) : undefined,
    };

    const text = JSON.stringify(logLine);
    if (level === "error" || level === "warn") {
      console.error(text);
    } else {
      console.log(text);
    }
  }

  return {
    debug: (message: string, meta?: Record<string, unknown>) =>
      write("debug", message, meta),
    info: (message: string, meta?: Record<string, unknown>) =>
      write("info", message, meta),
    warn: (message: string, meta?: Record<string, unknown>) =>
      write("warn", message, meta),
    error: (message: string, meta?: Record<string, unknown>) =>
      write("error", message, meta),
  };
}

