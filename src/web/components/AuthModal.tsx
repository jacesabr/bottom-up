import { useState } from 'react';
import '../styles/AuthModal.css';
import { login, register, storeUser, type AuthUser } from '../lib/auth';

/**
 * Username/password modal. Opened when a logged-out learner clicks a chapter. On success it stores
 * the user (localStorage) and calls onAuthed so the app can switch to the account's learnerId and
 * continue into the chapter the learner was trying to open.
 */
export default function AuthModal({
  apiBase,
  onAuthed,
  onClose,
}: {
  apiBase: string;
  onAuthed: (user: AuthUser) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const fn = mode === 'register' ? register : login;
      const user = await fn(apiBase, username, password);
      storeUser(user);
      onAuthed(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <button className="auth-close" onClick={onClose} aria-label="Close">×</button>

        <h2>{mode === 'register' ? 'Create your account' : 'Welcome back'}</h2>
        <p className="auth-sub">
          {mode === 'register'
            ? 'Pick a username and password to save your progress and open chapters.'
            : 'Log in to pick up where you left off.'}
        </p>

        <form onSubmit={submit}>
          <label>
            Username
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. arjun_10"
              autoFocus
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Log in'}
          </button>
        </form>

        <div className="auth-switch">
          {mode === 'register' ? (
            <>Already have an account?{' '}
              <button onClick={() => { setMode('login'); setError(null); }}>Log in</button>
            </>
          ) : (
            <>New here?{' '}
              <button onClick={() => { setMode('register'); setError(null); }}>Create an account</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
