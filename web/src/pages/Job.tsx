import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { ChangeCard } from '../components/ChangeCard';
import { MicButton } from '../components/MicButton';
import { ReviewCard } from '../components/ReviewCard';
import { formatUsd } from '../money';
import { AppShell } from '../components/AppShell';
import { Link } from 'react-router-dom';

export function JobPage() {
  const { id } = useParams();
  const [job, setJob] = useState<any>(null);
  const [error, setError] = useState('');
  const [recording, setRecording] = useState(false);
  const [review, setReview] = useState<any | null>(null);
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function load() {
    try {
      setJob(await api(`/api/jobs/${id}`));
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function startOrStop() {
    if (recording && mediaRef.current) {
      mediaRef.current.stop();
      setRecording(false);
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/mp4';
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    mediaRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: mime });
      const form = new FormData();
      form.append('audio', blob, 'note.webm');
      const data = await api<any>(`/api/jobs/${id}/draft-change`, { method: 'POST', body: form });
      const draft = data.draft || {};
      setReview({
        transcript: data.transcript || '',
        description: draft.description || '',
        amount: draft.amount || '',
        currency: (draft.currency || 'USD').toUpperCase(),
        days_delta: draft.days_delta ?? 0,
        source: 'voice',
        currencyOptions: ['USD', 'ZAR', 'EUR', 'GBP']
      });
    };
    recorder.start();
    setRecording(true);
    setTimeout(() => recorder.state === 'recording' && recorder.stop(), 60_000);
  }

  async function sendChange() {
    if (!review) return;
    setBusy('change');
    try {
      await api(`/api/jobs/${id}/changes`, {
        method: 'POST',
        body: JSON.stringify({
          description: review.description,
          amount: { currency: review.currency, amount: review.amount },
          days_delta: review.days_delta,
          transcript: review.transcript,
          source: review.source
        })
      });
      setReview(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  const pendingHint = useMemo(() => job?.pending_count ? `${job.pending_count} changes awaiting the client` : '', [job]);

  if (!job) return <main className="mx-auto max-w-md p-4">{error ? <div className="rounded-2xl bg-red-50 p-4 text-red-700">{error}</div> : <div className="h-32 animate-pulse rounded-2xl bg-stone-200" />}</main>;

  return (
    <AppShell><main className="mx-auto max-w-3xl p-4 pb-28 sm:p-6">
      <Link to="/jobs" className="text-sm text-indigo-600">← Back to jobs</Link>
      <p className="mt-5 text-sm text-stone-600">{job.client_name}</p>
      <h1 className="text-2xl font-semibold">{job.title}</h1>
      <p className="mt-3 text-4xl font-semibold">{formatUsd(job.total_cents)}</p>
      <div className="mt-2 flex gap-4 text-sm">
        <button onClick={async () => { await navigator.clipboard.writeText(`${window.location.origin}/c/${job.share_token}`); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="text-indigo-600">{copied ? 'Copied!' : 'Copy client link'}</button>
        {!job.invoice && <button onClick={async () => { await api(`/api/jobs/${id}/invoice`, { method: 'POST' }); await load(); }} className="text-indigo-600" disabled={job.pending_count > 0}>{job.pending_count > 0 ? pendingHint : 'Create invoice'}</button>}
      </div>
      {job.invoice && (
        <div className="mt-3 rounded-2xl border border-stone-200 p-3 text-sm">
          {job.invoice.status === 'paid' ? 'Paid' : 'Invoice sent · awaiting payment'}
          <div className="mt-2 flex gap-3">
            <a className="text-indigo-600" href={job.invoice.pay_url} target="_blank" rel="noreferrer">Open invoice</a>
            {job.invoice.status !== 'paid' && <button className="text-indigo-600" onClick={async () => { await api(`/api/jobs/${id}/invoice/refresh`, { method: 'POST' }); await load(); }}>Check payment</button>}
          </div>
        </div>
      )}
      <div className="mt-4 space-y-3">
        <div className="rounded-2xl border border-stone-200 bg-white p-4"><p className="font-medium">Original quote</p><p className="text-sm text-stone-600">{formatUsd(job.quote_cents)}</p></div>
        {job.changes.map((change: any) => <ChangeCard key={change.id} change={change} onWithdraw={async () => { await api(`/api/jobs/${id}/changes/${change.id}/withdraw`, { method: 'POST' }); await load(); }} />)}
      </div>
      {review && <div className="fixed bottom-24 left-0 right-0 mx-auto max-w-md px-4"><ReviewCard transcript={review.transcript || "We couldn't find a change in that. Edit below or try again."} values={review} setValues={setReview} onSubmit={sendChange} onDiscard={() => setReview(null)} submitting={busy === 'change'} /></div>}
      <div className="fixed bottom-4 left-0 right-0 mx-auto flex max-w-3xl items-center justify-center gap-4 px-4">
        <MicButton recording={recording} onClick={startOrStop} />
        <button
          className="text-sm text-stone-600"
          onClick={() =>
            setReview({
              transcript: '',
              description: '',
              amount: '',
              currency: 'USD',
              days_delta: 0,
              source: 'text',
              currencyOptions: ['USD', 'ZAR', 'EUR', 'GBP']
            })
          }
        >
          Type instead
        </button>
      </div>
    </main></AppShell>
  );
}
