export function StatusDot({ status }: { status: 'awaiting_client' | 'approved' | 'disputed' | 'withdrawn' }) {
  const map = {
    awaiting_client: ['bg-amber-500', 'Awaiting client'],
    approved: ['bg-green-600', 'Approved'],
    disputed: ['bg-red-600', 'Disputed'],
    withdrawn: ['bg-stone-400', 'Withdrawn']
  } as const;
  const [dot, label] = map[status];
  return <span className="inline-flex items-center gap-2 text-sm text-stone-700"><span className={`h-2.5 w-2.5 rounded-full ${dot}`} />{label}</span>;
}
