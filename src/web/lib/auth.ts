// Client-side auth: a successful register/login returns a user { id, username }. We persist it in
// localStorage and use `id` as the learnerId for every progress/teaching call, so all progress ties
// to the account. No server session/token — minimal by design for the current stage.

export interface AuthUser {
  id: string;
  username: string;
}

const USER_KEY = 'authUser';
const TOKEN_KEY = 'sessionToken'; // signed session token; main.tsx attaches it to API requests

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const u = JSON.parse(raw);
    if (u && typeof u.id === 'string' && typeof u.username === 'string') return u;
  } catch {
    /* corrupt value — treat as logged out */
  }
  return null;
}

export function storeUser(user: AuthUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearUser(): void {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(TOKEN_KEY);
}

async function post(apiBase: string, path: string, body: unknown): Promise<AuthUser> {
  const res = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Something went wrong. Try again.');
  if (typeof data.token === 'string' && data.token) localStorage.setItem(TOKEN_KEY, data.token);
  return data.user as AuthUser;
}

export function register(apiBase: string, username: string, password: string): Promise<AuthUser> {
  return post(apiBase, '/auth/register', { username, password });
}

export function login(apiBase: string, username: string, password: string): Promise<AuthUser> {
  return post(apiBase, '/auth/login', { username, password });
}
