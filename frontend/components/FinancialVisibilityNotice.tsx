import React from 'react';
import type { FinancialVisibility } from '../hooks/useFinancialVisibility';

export default function FinancialVisibilityNotice({ privacy }: { privacy: FinancialVisibility }) {
  if (!privacy.error) return null;
  return <div className="financial-visibility-notice" role="alert">
    <span>{privacy.error}</span>
    <button type="button" disabled={privacy.saving} onClick={privacy.retry}>{privacy.saving ? 'Saving…' : 'Retry'}</button>
  </div>;
}
