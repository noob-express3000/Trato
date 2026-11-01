import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { formatUsd } from '../money';

export function ClientPage() {
  const { token } = useParams();
  const [job, setJob] = useState<any>(null);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function load() {
    try {
      setJob(await api(`/api/c/${token}`));
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, [token]);

  if (error) return <main className="mx-auto max-w-md p-4">{error}</main>;
  if (!job) return <main className="mx-auto max-w-md p-4">Loading…</main>;

  const pending = job.changes.filter((c: any) => c.status === 'awaiting_client');
  const resolved = job.changes.filter((c: any) => c.status !== 'awaiting_client');

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-semibold">{job.business_name} proposed changes to {job.title}</h1>
      <p className="mt-3 text-4xl font-semibold">{formatUsd(job.total_cents)}</p>
      {job.days_added > 0 && <p className="text-stone-600">+{job.days_added} days</p>}
      <div className="mt-4 space-y-3">
        {pending.map((change: any) => (
          <div key={change.id} className="rounded-2xl border border-stone-200 p-4">
            <p className="font-medium">{change.description}</p>
            <p className="text-sm text-stone-600">+{formatUsd(change.amount_cents)} · +{change.days_delta} days</p>
            <details className="mt-2 text-sm text-stone-600"><summary>Show what was said</summary><p>{change.transcript}</p></details>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button className="h-11 rounded-2xl bg-indigo-600 text-white" onClick={async () => { await api(`/api/c/${token}/changes/${change.id}/approve`, { method: 'POST' }); await load(); }}>Approve</button>
              <button className="h-11 rounded-2xl border border-stone-300" onClick={async () => { await api(`/api/c/${token}/changes/${change.id}/dispute`, { method: 'POST', body: JSON.stringify({ note: notes[change.id] || undefined }) }); await load(); }}>Dispute</button>
            </div>
            <input className="mt-2 h-11 w-full rounded-2xl border border-stone-300 px-3" placeholder="Optional note" value={notes[change.id] || ''} onChange={(e) => setNotes((n) => ({ ...n, [change.id]: e.target.value }))} />
          </div>
        ))}
      </div>
      {resolved.length > 0 && <div className="mt-6 space-y-2">{resolved.map((c: any) => <div key={c.id} className="rounded-2xl border border-stone-200 p-3 text-sm text-stone-700">{c.description} · {c.status}</div>)}</div>}
      {job.invoice && job.invoice.status !== 'paid' && <a className="mt-6 inline-flex h-11 items-center rounded-2xl bg-indigo-600 px-4 text-white" href={job.invoice.pay_url} target="_blank" rel="noreferrer">Pay invoice</a>}
      {job.invoice?.status === 'paid' && <p className="mt-6 text-green-700">Paid. Thank you.</p>}
    </main>
  );
}
