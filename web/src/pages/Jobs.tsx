import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { formatUsd } from '../money';
import { AppShell } from '../components/AppShell';
import { RefreshCw, BriefcaseBusiness } from 'lucide-react';

export function JobsPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    api<any[]>('/api/jobs').then(setJobs).catch((e) => {
      setError(e.message);
      if (e.message === 'Not authenticated' || e.message === 'Invalid session') navigate('/');
    }).finally(() => setLoading(false));
  }, [navigate]);

  return (
    <AppShell>
      <main className="mx-auto max-w-3xl p-4 sm:p-6">
        <div className="mb-6 flex items-end justify-between">
          <div><p className="text-sm font-medium text-indigo-600">Workspace</p><h1 className="text-2xl font-semibold">Your jobs</h1><p className="mt-1 text-sm text-stone-500">Keep every approval and payment in one place.</p></div>
          <Link className="hidden rounded-2xl bg-indigo-600 px-4 py-2 text-white sm:block" to="/jobs/new">New job</Link>
        </div>
        {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {loading ? <div className="space-y-3">{[1, 2, 3].map((n) => <div key={n} className="h-20 animate-pulse rounded-2xl bg-stone-200" />)}</div> : jobs.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-10 text-center">
            <BriefcaseBusiness className="mx-auto text-stone-400" size={30} />
            <h2 className="mt-3 font-medium">No jobs yet</h2><p className="mt-1 text-sm text-stone-500">Start with a quote and invite your client to review changes.</p>
            <Link className="mt-5 inline-flex rounded-2xl bg-indigo-600 px-4 py-2 text-white" to="/jobs/new">Create your first job</Link>
          </div>
        ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <Link key={job.id} to={`/jobs/${job.id}`} className="block rounded-2xl border border-stone-200 bg-white p-4 transition hover:border-indigo-300 hover:shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div><p className="font-medium">{job.client_name}</p><p className="text-sm text-stone-600">{job.title}</p></div>
                <div className="text-right"><p className="font-medium">{formatUsd(job.total_cents)}</p><p className="text-xs capitalize text-stone-500">{job.stage.replace('_', ' ')}</p></div>
              </div>
            </Link>
          ))}
        </div>
      )}
        {!loading && jobs.length > 0 && <button className="mx-auto mt-5 flex items-center gap-2 text-sm text-stone-500" onClick={() => window.location.reload()}><RefreshCw size={14} /> Refresh</button>}
      </main>
    </AppShell>
  );
}
