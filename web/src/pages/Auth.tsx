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
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function submit() {
    setError('');
    setSubmitting(true);
    try {
      if (create) {
        await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password, business_name: businessName, local_currency: currency }) });
      } else {
        await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      }
      navigate('/jobs');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center p-4">
      <div className="w-full rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-indigo-600">Trato hecho.</p><h1 className="mt-1 text-3xl font-semibold">Get paid for the work you approve.</h1><p className="mt-2 text-sm text-stone-500">Turn scope changes into clear client approvals and invoices.</p>
      <div className="space-y-3">
        <label className="block text-sm font-medium">Email<input className="mt-1 h-11 w-full rounded-2xl border border-stone-300 px-3" type="email" placeholder="you@business.com" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="block text-sm font-medium">Password<input className="mt-1 h-11 w-full rounded-2xl border border-stone-300 px-3" type="password" placeholder="At least 10 characters" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {create && (
          <>
            <label className="block text-sm font-medium">Business name<input className="mt-1 h-11 w-full rounded-2xl border border-stone-300 px-3" placeholder="Your business" value={businessName} onChange={(e) => setBusinessName(e.target.value)} /></label>
            <label className="block text-sm font-medium">Default currency<select className="mt-1 h-11 w-full rounded-2xl border border-stone-300 px-3" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option>USD</option><option>ZAR</option><option>EUR</option><option>GBP</option>
            </select></label>
          </>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button className="h-11 w-full rounded-2xl bg-indigo-600 text-white disabled:cursor-not-allowed disabled:opacity-60" onClick={submit} disabled={submitting}>{submitting ? 'Working…' : create ? 'Create account' : 'Sign in'}</button>
        <a className="block h-11 rounded-2xl border border-stone-300 py-3 text-center text-sm" href="/api/auth/google">Continue with Google</a>
        <button className="text-sm text-stone-600" onClick={() => setCreate((v) => !v)}>{create ? 'Have an account? Sign in' : 'Need an account? Create one'}</button>
      </div>
      </div>
    </main>
  );
}
