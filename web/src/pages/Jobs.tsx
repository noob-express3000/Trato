import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { formatUsd } from '../money';

export function JobsPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api<any[]>('/api/jobs').then(setJobs).catch((e) => {
      setError(e.message);
      navigate('/');
    });
  }, [navigate]);

  return (
    <main className="mx-auto max-w-md p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Jobs</h1>
        <Link className="rounded-2xl bg-indigo-600 px-4 py-2 text-white" to="/jobs/new">New job</Link>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {jobs.length === 0 ? <p className="text-stone-600">No jobs yet.</p> : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <Link key={job.id} to={`/jobs/${job.id}`} className="block rounded-2xl border border-stone-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div><p className="font-medium">{job.client_name}</p><p className="text-sm text-stone-600">{job.title}</p></div>
                <div className="text-right"><p>{formatUsd(job.total_cents)}</p><p className="text-xs text-stone-600">{job.stage}</p></div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
