import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export function AuthPage() {
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const authError = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('auth_error') || '';
  }, []);

  useEffect(() => {
    if (authError) setError(authError);
    api('/api/auth/me').then(() => navigate('/jobs')).catch(() => undefined);
  }, [authError, navigate]);

  function signInWithGoogle() {
    window.location.assign('/api/auth/google');
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="mb-6 text-2xl font-semibold">Trato</h1>
      <div className="space-y-3">
        <p className="text-sm text-stone-600">Sign in with your Google account to continue.</p>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button className="h-11 w-full rounded-2xl bg-indigo-600 text-white" onClick={signInWithGoogle}>Continue with Google</button>
      </div>
    </main>
  );
}
