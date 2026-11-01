import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export function AuthPage() {
  const [create, setCreate] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function submit() {
    setError('');
    try {
      if (create) {
        await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password, business_name: businessName, local_currency: currency }) });
      } else {
        await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      }
      navigate('/jobs');
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="mb-6 text-2xl font-semibold">Trato</h1>
      <div className="space-y-3">
        <input className="h-11 w-full rounded-2xl border border-stone-300 px-3" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="h-11 w-full rounded-2xl border border-stone-300 px-3" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {create && (
          <>
            <input className="h-11 w-full rounded-2xl border border-stone-300 px-3" placeholder="Business name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
            <select className="h-11 w-full rounded-2xl border border-stone-300 px-3" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option>USD</option><option>ZAR</option><option>EUR</option><option>GBP</option>
            </select>
          </>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button className="h-11 w-full rounded-2xl bg-indigo-600 text-white" onClick={submit}>{create ? 'Create account' : 'Sign in'}</button>
        <button className="text-sm text-stone-600" onClick={() => setCreate((v) => !v)}>{create ? 'Have an account? Sign in' : 'Need an account? Create one'}</button>
      </div>
    </main>
  );
}
