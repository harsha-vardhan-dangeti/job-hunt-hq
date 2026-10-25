'use client';

import { createBrowserClient } from '@supabase/ssr';
import { useEffect, useState } from 'react';

const ERRORS = {
  not_allowed: "That Google account can't open this tracker. Sign in with the account it was set up for.",
  auth: "Google sign-in didn't finish. Try again.",
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export default function LoginForm({ google, password }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [next, setNext] = useState('/');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const n = params.get('next');
    if (n && n.startsWith('/') && !n.startsWith('//')) setNext(n);
    const code = params.get('error');
    if (code) setError(ERRORS[code] || ERRORS.auth);
  }, []);

  async function withGoogle() {
    setBusy(true);
    setError('');
    const supabase = createBrowserClient(google.url, google.key);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function withPassword(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    if (res.ok) {
      window.location.replace(next);
      return;
    }
    const body = await res.json().catch(() => ({}));
    setError(body.error || 'Sign-in failed.');
    setBusy(false);
  }

  return (
    <main className="gate">
      <div className="gate-card">
        <span className="brand-mark gate-mark" aria-hidden="true">
          JH
        </span>
        <h1>Job Hunt HQ</h1>
        <p className="muted">Your private tracker. Sign in to open it.</p>

        {google ? (
          <button className="google-btn" onClick={withGoogle} disabled={busy}>
            <GoogleMark />
            {busy ? 'Opening Google…' : 'Continue with Google'}
          </button>
        ) : null}

        {google && password ? <p className="gate-or">or use the password</p> : null}

        {password ? (
          <form onSubmit={withPassword} className="gate-form">
            <label htmlFor="pw">Password</label>
            <input
              id="pw"
              type="password"
              value={pw}
              autoFocus={!google}
              autoComplete="current-password"
              onChange={(e) => setPw(e.target.value)}
            />
            <button className={google ? 'ghost' : 'primary'} type="submit" disabled={busy || !pw}>
              Open tracker
            </button>
          </form>
        ) : null}

        {!google && !password ? <p className="muted">Sign-in isn&apos;t set up, so the tracker is open.</p> : null}
        {error ? (
          <p className="gate-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}
