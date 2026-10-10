// Lightweight, dependency-free error tracking for Terima Rides.
//
// Uncaught errors, unhandled promise rejections and React render crashes are
// POSTed to the `client_errors` table in Supabase (see
// sql/2026-10-10_client_errors.sql). Nothing is sent until that table exists —
// a failed report is silently dropped, so this can never break the app.
//
// Privacy: only the error message, stack, page path, browser string and app
// version are sent. No user id, email, URL hash or query string (the hash can
// carry password-recovery tokens, so it is deliberately never read).

const SUPABASE_URL = "https://dokgjfraatfzdnzqftvy.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_e4Va8w2ihrstELS4uat06A_h3cxhwAR";
const APP_VERSION = "2026-10-10";
const MAX_REPORTS_PER_SESSION = 8;

let sent = 0;
const seen = new Set();

function clip(value, max) {
  return String(value == null ? "" : value).slice(0, max);
}

export function reportError(error, source = "window") {
  try {
    if (import.meta.env && import.meta.env.DEV) return;
    if (sent >= MAX_REPORTS_PER_SESSION) return;

    const message = clip((error && error.message) || error, 500);
    const stack = clip(error && error.stack, 4000);
    if (!message) return;

    // Ignore noise we can't act on (browser extensions, cross-origin scripts).
    if (/^Script error\.?$/i.test(message) || /ResizeObserver loop/i.test(message)) return;

    const key = `${source}|${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    sent += 1;

    fetch(`${SUPABASE_URL}/rest/v1/client_errors`, {
      method: "POST",
      keepalive: true,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        message,
        stack,
        source: clip(source, 40),
        path: clip(window.location.pathname, 200),
        user_agent: clip(navigator.userAgent, 300),
        app_version: APP_VERSION,
      }),
    }).catch(() => {});
  } catch {
    // Reporting must never throw.
  }
}

export function installGlobalErrorHandlers() {
  window.addEventListener("error", (e) => reportError(e.error || e.message, "window.onerror"));
  window.addEventListener("unhandledrejection", (e) => reportError(e.reason, "unhandledrejection"));
}
