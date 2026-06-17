import posthog from 'posthog-js';

/**
 * PostHog analytics — enabled ONLY when VITE_POSTHOG_KEY (the `phc_` PROJECT api key) is set at build
 * time; a clean no-op otherwise. Set VITE_POSTHOG_KEY (+ optional VITE_POSTHOG_HOST) on the *-web
 * Render static service. NEVER put a `phx_` personal key here — that's a secret for the API, not the client.
 */
const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string) || 'https://us.i.posthog.com';
let started = false;

export function initAnalytics(): void {
  if (started || !KEY) return;
  started = true;
  posthog.init(KEY, {
    api_host: HOST,
    capture_pageview: false, // we send $pageview per SPA view ourselves (aPage)
    autocapture: true, // captures clicks/inputs automatically — "all the data" with no tagging
    person_profiles: 'identified_only',
  });
}

export function aIdentify(id: string, props?: Record<string, unknown>): void {
  if (started) posthog.identify(id, props);
}
export function aReset(): void {
  if (started) posthog.reset();
}
export function aPage(name: string): void {
  if (started) posthog.capture('$pageview', { page: name });
}
export function aCapture(event: string, props?: Record<string, unknown>): void {
  if (started) posthog.capture(event, props);
}
