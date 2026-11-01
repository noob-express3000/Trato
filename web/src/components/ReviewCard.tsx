import { AmountInput } from './AmountInput';

export function ReviewCard({ transcript, values, setValues, onSubmit, onDiscard, hint }: any) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <p className="text-sm text-stone-500">{transcript}</p>
      <label className="mt-3 block text-sm">What changed</label>
      <textarea className="mt-1 min-h-24 w-full rounded-2xl border border-stone-300 p-3" value={values.description} onChange={(e) => setValues({ ...values, description: e.target.value })} />
      <label className="mt-3 block text-sm">Cost</label>
      <AmountInput value={values.amount} onChange={(v) => setValues({ ...values, amount: v })} currency={values.currency} onCurrencyChange={(v) => setValues({ ...values, currency: v })} currencies={values.currencyOptions} />
      {hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
      <label className="mt-3 block text-sm">Extra days</label>
      <input className="mt-1 h-11 w-full rounded-2xl border border-stone-300 px-3" type="number" value={values.days_delta} onChange={(e) => setValues({ ...values, days_delta: Number(e.target.value) })} />
      <div className="mt-4 flex gap-2">
        <button className="h-11 rounded-2xl bg-indigo-600 px-4 text-white" onClick={onSubmit}>Send to client</button>
        <button className="h-11 rounded-2xl px-4 text-stone-700" onClick={onDiscard}>Discard</button>
      </div>
    </div>
  );
}
