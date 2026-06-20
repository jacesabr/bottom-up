import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

// Attach the signed session token (anti-impersonation) to our OWN API requests — one central hook so every
// component/voice fetch carries it with no per-call wiring. Never overrides an explicit Authorization
// header (the admin panel's Basic auth), and only targets the API base (so the token never leaks to R2/CDN).
const API_BASE = import.meta.env.VITE_API_URL || '/api';
const _fetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  try {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : '';
    const token = localStorage.getItem('sessionToken');
    if (token && url && (url.startsWith(API_BASE) || url.startsWith('/api'))) {
      const headers = new Headers(init?.headers);
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
        init = { ...(init ?? {}), headers };
      }
    }
  } catch {
    /* never let the wrapper break a request */
  }
  return _fetch(input, init);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
