export function AmountInput({ value, onChange, currency, onCurrencyChange, currencies }: {
  value: string;
  onChange: (v: string) => void;
  currency: string;
  onCurrencyChange?: (v: string) => void;
  currencies?: string[];
}) {
  return (
    <div className="flex gap-2">
      <input className="h-11 w-full rounded-2xl border border-stone-300 px-3" value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" />
      <select className="h-11 rounded-2xl border border-stone-300 px-3" value={currency} onChange={(e) => onCurrencyChange?.(e.target.value)} disabled={!onCurrencyChange}>
        {(currencies || [currency]).map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  );
}
