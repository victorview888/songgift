import Link from "next/link";

export function TermsConfirmation({ disabled = false, payment = false }: { disabled?: boolean; payment?: boolean }) {
  return <div className="legal-consent">
    <label className="legal-confirmation">
      <input type="checkbox" name="termsConfirmed" required disabled={disabled} />
      <span>I am at least 18 and have reached the age of majority where I live. I agree to the <Link href="/policies/terms" target="_blank" rel="noopener">Terms of Service</Link>{payment ? <> and have reviewed the <Link href="/policies/refunds" target="_blank" rel="noopener">payment and refund information</Link></> : null}.</span>
    </label>
    <p className="legal-notice">See our <Link href="/policies/privacy" target="_blank" rel="noopener">Privacy Policy</Link> for how we handle your information.</p>
  </div>;
}
