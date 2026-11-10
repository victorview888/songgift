"use client";
export type PaymentMethod = { id: "paypal" | "waffo"; label: string; description: string; available: boolean };
export function PaymentMethodSelector({ methods, selected, disabled, onChange, loading = false, error = "", onRetry }: {
  methods: PaymentMethod[]; selected: PaymentMethod["id"]; disabled: boolean; onChange: (id: PaymentMethod["id"]) => void;
  loading?: boolean; error?: string; onRetry?: () => void;
}) {
  const available = methods.filter(method => method.available);
  return <fieldset className="payment-methods" disabled={disabled}>
    <legend>Payment method</legend>
    {loading ? <p role="status">Loading payment options…</p> : error ? <div role="alert"><p>{error}</p>{onRetry && <button className="text-button" type="button" onClick={onRetry}>Retry payment options</button>}</div> : !available.length ? <p role="status">Checkout is temporarily unavailable. Your lyrics are saved.</p> :
      available.map(method => <label className="payment-method" key={method.id} data-selected={selected === method.id}>
        <input type="radio" name="paymentMethod" value={method.id} checked={selected === method.id} onChange={() => onChange(method.id)} />
        <span><strong>{method.label}</strong><small>{method.description}</small></span>
      </label>)}
    {selected === "waffo" && available.some(method => method.id === "waffo") && <p className="payment-method-note">Your bank or Waffo may display a local currency amount. Review the final amount at checkout.</p>}
  </fieldset>;
}
