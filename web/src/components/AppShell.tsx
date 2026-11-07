import { LogOut, Plus, ReceiptText } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' });
    navigate('/');
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/jobs" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-indigo-600 text-white"><ReceiptText size={17} /></span>
            Trato
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link className={`rounded-xl px-3 py-2 ${location.pathname === '/jobs' ? 'bg-indigo-50 text-indigo-700' : 'text-stone-600'}`} to="/jobs">Jobs</Link>
            <Link className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-2 text-white" to="/jobs/new"><Plus size={15} /> New job</Link>
            <button aria-label="Sign out" title="Sign out" className="rounded-xl p-2 text-stone-500 hover:bg-stone-100" onClick={logout}><LogOut size={17} /></button>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
