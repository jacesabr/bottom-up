import { getStoredUser } from './auth';

// A random, cookieless visitor id kept in localStorage — lets us count unique visitors without PII.
function visitorId(): string {
  let id = localStorage.getItem('visitorId');
  if (!id) {
    id = 'v-' + crypto.randomUUID();
    localStorage.setItem('visitorId', id);
  }
  return id;
}

/** Fire a page-visit beacon (fire-and-forget). Never blocks or throws. */
export function track(apiBase: string, path: string): void {
  try {
    const user = getStoredUser();
    fetch(`${apiBase}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        path,
        referrer: typeof document !== 'undefined' ? document.referrer || null : null,
        visitorId: visitorId(),
        learnerId: user?.id || null,
      }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
