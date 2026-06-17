import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';

/**
 * Simple username/password auth. No tokens/sessions on the server: a successful register/login
 * returns the user's id, which the client uses as its `learnerId` (so all progress ties to the
 * account). Passwords are scrypt-hashed as "<saltHex>:<hashHex>". This is intentionally minimal —
 * adequate for the current stage, not bank-grade (no rate-limiting, no email verification).
 */

export interface AuthUser {
  id: string;
  username: string;
}

function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(pw: string, stored: string | null): boolean {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(pw, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Validation shared by register/login. Returns an error string, or null if OK. */
function validate(username: string, password: string): string | null {
  if (!username || username.trim().length < 3) return 'Username must be at least 3 characters.';
  if (username.trim().length > 32) return 'Username must be 32 characters or fewer.';
  if (!/^[a-zA-Z0-9_.-]+$/.test(username.trim())) return 'Username can use letters, numbers, and _ . - only.';
  if (!password || password.length < 6) return 'Password must be at least 6 characters.';
  return null;
}

export class AuthError extends Error {}

export async function registerUser(usernameRaw: string, password: string): Promise<AuthUser> {
  const err = validate(usernameRaw, password);
  if (err) throw new AuthError(err);
  const username = usernameRaw.trim();

  // Case-insensitive existence check (a lower(username) unique index backs this up at the DB level).
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`)
    .limit(1);
  if (existing.length) throw new AuthError('That username is taken.');

  try {
    const [row] = await db
      .insert(users)
      .values({ username, passwordHash: hashPassword(password) })
      .returning({ id: users.id, username: users.username });
    return { id: row.id, username: row.username! };
  } catch (e: any) {
    // Unique-index race: another request grabbed the name between our check and insert.
    if (String(e?.message ?? e).includes('users_username_lower_unique')) throw new AuthError('That username is taken.');
    throw e;
  }
}

export async function loginUser(usernameRaw: string, password: string): Promise<AuthUser> {
  const username = (usernameRaw ?? '').trim();
  if (!username || !password) throw new AuthError('Enter your username and password.');

  const [row] = await db
    .select({ id: users.id, username: users.username, passwordHash: users.passwordHash })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`)
    .limit(1);

  if (!row || !verifyPassword(password, row.passwordHash)) throw new AuthError('Wrong username or password.');
  return { id: row.id, username: row.username! };
}
