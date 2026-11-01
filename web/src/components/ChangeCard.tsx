import { useState } from 'react';
import { formatUsd } from '../money';
import { StatusDot } from './StatusDot';

export function ChangeCard({ change, onWithdraw }: { change: any; onWithdraw?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-stone-200 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">{change.description}</p>
          <p className="text-sm text-stone-600">+{formatUsd(change.amount_cents)} · +{change.days_delta} days</p>
        </div>
        <StatusDot status={change.status} />
      </div>
      <button className="mt-2 text-sm text-indigo-600" onClick={() => setOpen((v) => !v)}>Show what was said</button>
      {open && <p className="mt-2 text-sm text-stone-600">{change.transcript}</p>}
      {onWithdraw && change.status === 'awaiting_client' && <button className="mt-2 text-sm text-stone-600" onClick={onWithdraw}>Withdraw</button>}
    </div>
  );
}
