/**
 * Performance monitoring utilities — records metrics + errors to perf_metrics / error_logs.
 * Batches inserts (max 25 every 5s) to keep DB write pressure low.
 * Safe to call on any client. Silent on failure.
 */
import { supabase } from "@/integrations/supabase/client";

type Kind =
  | "server_fn"
  | "server_route"
  | "client_nav"
  | "db_query"
  | "external_api"
  | "ws"
  | "bid"
  | "chat"
  | "upload"
  | "stripe"
  | "shipping"
  | "live_view"
  | "image_upload";

type MetricRow = {
  user_id?: string | null;
  route: string;
  method?: string;
  status_code?: number | null;
  duration_ms: number;
  kind?: Kind;
  metadata?: Record<string, unknown>;
};

type ErrorRow = {
  user_id?: string | null;
  severity?: "info" | "warning" | "error" | "critical";
  source?: "client" | "server_fn" | "server_route" | "edge" | "db" | "unknown";
  route?: string;
  message: string;
  stack?: string;
  metadata?: Record<string, unknown>;
};

const metricQueue: MetricRow[] = [];
const errorQueue: ErrorRow[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const MAX_BATCH = 25;
const FLUSH_MS = 5000;

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_MS);
}

async function flush() {
  if (typeof window === "undefined") return;
  const m = metricQueue.splice(0, MAX_BATCH);
  const e = errorQueue.splice(0, MAX_BATCH);
  try {
    if (m.length) await supabase.from("perf_metrics").insert(m as any);
  } catch {
    /* ignore */
  }
  try {
    if (e.length) await supabase.from("error_logs").insert(e as any);
  } catch {
    /* ignore */
  }
  if (metricQueue.length || errorQueue.length) scheduleFlush();
}

export function recordMetric(row: MetricRow) {
  if (typeof window === "undefined") return;
  metricQueue.push({
    method: "GET",
    kind: "server_fn",
    metadata: {},
    ...row,
    route: row.route.slice(0, 200),
    duration_ms: Math.max(0, Math.min(600000, Math.round(row.duration_ms))),
  });
  if (metricQueue.length >= MAX_BATCH) void flush();
  else scheduleFlush();
}

export function recordError(row: ErrorRow) {
  if (typeof window === "undefined") return;
  errorQueue.push({
    severity: "error",
    source: "client",
    metadata: {},
    ...row,
    message: row.message.slice(0, 2000),
    stack: row.stack?.slice(0, 8000),
  });
  if (errorQueue.length >= MAX_BATCH) void flush();
  else scheduleFlush();
}

/** Wrap any async fn — records duration + status. Returns the result. */
export async function timed<T>(
  route: string,
  kind: Kind,
  fn: () => Promise<T>,
  meta?: Record<string, unknown>,
): Promise<T> {
  const start = performance.now();
  try {
    const out = await fn();
    recordMetric({
      route,
      kind,
      duration_ms: performance.now() - start,
      status_code: 200,
      metadata: meta,
    });
    return out;
  } catch (err: any) {
    const duration = performance.now() - start;
    recordMetric({
      route,
      kind,
      duration_ms: duration,
      status_code: 500,
      metadata: { ...meta, error: String(err?.message ?? err) },
    });
    recordError({
      route,
      message: String(err?.message ?? err),
      stack: err?.stack,
      source: "client",
      severity: "error",
      metadata: { kind },
    });
    throw err;
  }
}

let installed = false;
/** Hook global window error + unhandledrejection + page-load timing. Call once. */
export function installGlobalPerfHandlers() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (ev) => {
    recordError({
      message: ev.message || "window.error",
      stack: ev.error?.stack,
      route: window.location.pathname,
      source: "client",
      severity: "error",
      metadata: { filename: ev.filename, line: ev.lineno, col: ev.colno },
    });
  });

  window.addEventListener("unhandledrejection", (ev) => {
    const reason: any = ev.reason;
    recordError({
      message: String(reason?.message ?? reason ?? "unhandledrejection"),
      stack: reason?.stack,
      route: window.location.pathname,
      source: "client",
      severity: "error",
      metadata: { kind: "unhandledrejection" },
    });
  });

  // Page load timing
  if ("performance" in window) {
    setTimeout(() => {
      try {
        const nav = performance.getEntriesByType?.("navigation")?.[0] as
          | PerformanceNavigationTiming
          | undefined;
        if (nav) {
          recordMetric({
            route: window.location.pathname,
            kind: "client_nav",
            duration_ms: nav.duration,
            status_code: 200,
            metadata: {
              dom: Math.round(nav.domContentLoadedEventEnd),
              load: Math.round(nav.loadEventEnd),
              ttfb: Math.round(nav.responseStart - nav.requestStart),
            },
          });
        }
      } catch {
        /* ignore */
      }
    }, 1500);
  }

  // Flush on hide
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flush();
  });
}
