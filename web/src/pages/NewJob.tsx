import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { AmountInput } from '../components/AmountInput';

export function NewJobPage() {
  const [title, setTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [error, setError] = useState('');
  const nav = useNavigate();

  async function create() {
    setError('');
    try {
      const job = await api<any>('/api/jobs', { method: 'POST', body: JSON.stringify({ title, client_name: clientName, client_email: clientEmail, quote: { currency, amount } }) });
      nav(`/jobs/${job.id}`);
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <main className="mx-auto max-w-md p-4 space-y-3">
      <h1 className="text-xl font-semibold">New job</h1>
      <input className="h-11 w-full rounded-2xl border border-stone-300 px-3" placeholder="Job title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input className="h-11 w-full rounded-2xl border border-stone-300 px-3" placeholder="Client name" value={clientName} onChange={(e) => setClientName(e.target.value)} />
      <input className="h-11 w-full rounded-2xl border border-stone-300 px-3" placeholder="Client email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
      <AmountInput value={amount} onChange={setAmount} currency={currency} onCurrencyChange={setCurrency} currencies={['USD','ZAR','EUR','GBP']} />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button className="h-11 rounded-2xl bg-indigo-600 px-4 text-white" onClick={create}>Create job</button>
    </main>
  );
}
