import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { AmountInput } from '../components/AmountInput';
import { AppShell } from '../components/AppShell';
import { Link } from 'react-router-dom';

export function NewJobPage() {
  const [title, setTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const nav = useNavigate();

  async function create() {
    setError('');
    setSubmitting(true);
    try {
      const job = await api<any>('/api/jobs', { method: 'POST', body: JSON.stringify({ title, client_name: clientName, client_email: clientEmail, quote: { currency, amount } }) });
      nav(`/jobs/${job.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell><main className="mx-auto max-w-2xl p-4 sm:p-6">
      <Link to="/jobs" className="text-sm text-indigo-600">← Back to jobs</Link>
      <h1 className="mt-5 text-2xl font-semibold">Create a new job</h1><p className="mt-1 text-sm text-stone-500">Set the original quote. You can add changes after the client reviews them.</p>
      <div className="mt-6 space-y-4 rounded-3xl border border-stone-200 bg-white p-5">
        <label className="block text-sm font-medium">Job title<input className="mt-1 h-11 w-full rounded-2xl border border-stone-300 px-3" placeholder="Website redesign" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">Client name<input className="mt-1 h-11 w-full rounded-2xl border border-stone-300 px-3" placeholder="Alex Morgan" value={clientName} onChange={(e) => setClientName(e.target.value)} /></label><label className="block text-sm font-medium">Client email<input className="mt-1 h-11 w-full rounded-2xl border border-stone-300 px-3" type="email" placeholder="alex@example.com" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} /></label></div>
        <label className="block text-sm font-medium">Original quote<AmountInput value={amount} onChange={setAmount} currency={currency} onCurrencyChange={setCurrency} currencies={['USD','ZAR','EUR','GBP']} /></label>
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button className="h-11 rounded-2xl bg-indigo-600 px-5 text-white disabled:opacity-60" onClick={create} disabled={submitting}>{submitting ? 'Creating…' : 'Create job'}</button>
      </div>
    </main></AppShell>
  );
}
