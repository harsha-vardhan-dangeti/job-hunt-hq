'use client';

import { useState } from 'react';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      const next = new URLSearchParams(window.location.search).get('next') || '/';
      window.location.replace(next);
      return;
    }
    const body = await res.json().catch(() => ({}));
    setError(body.error || 'Sign-in failed.');
    setBusy(false);
  }

  return (
    <main className="gate">
      <form onSubmit={submit} className="gate-card">
        <h1>Job Hunt HQ</h1>
        <p className="muted">This tracker is private.</p>
        <label htmlFor="pw">Password</label>
        <input
          id="pw"
          type="password"
          value={password}
          autoFocus
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
        />
        {error ? <p className="gate-error">{error}</p> : null}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Checking…' : 'Open tracker'}
        </button>
      </form>
    </main>
  );
}
