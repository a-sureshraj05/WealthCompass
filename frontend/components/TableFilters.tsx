import React, { useEffect, useId, useRef, useState } from 'react';
import './table-controls.css';

export interface FilterChip { key: string; label: string; onRemove: () => void }
export const selectionChips = (label: string, values: readonly string[], onChange: (values: string[]) => void, format = (value: string) => value): FilterChip[] => values.map(value => ({ key: `${label}:${value}`, label: `${label}: ${format(value)}`, onRemove: () => onChange(values.filter(v => v !== value)) }));
export const TAX_TERM_OPTIONS = [{ value: 'short', label: 'Short term' }, { value: 'long', label: 'Long term' }];

export function FilterToolbar({ children, chips = [], onClear, resultLabel, actions, extra }: { children: React.ReactNode; chips?: FilterChip[]; onClear: () => void; resultLabel: string; actions?: React.ReactNode; extra?: React.ReactNode }) {
  return <section className="table-filterbar" aria-label="Table filters">
    <div className="table-filter-heading"><div><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z" strokeLinejoin="round" /></svg><strong>Filters</strong><span role="status" aria-live="polite">{resultLabel}</span></div><div className="table-view-actions">{actions}</div></div>
    <div className="table-filter-fields">{children}</div>
    {extra && <div className="table-filter-extra">{extra}</div>}
    <div className={`table-filter-summary ${chips.length ? 'has-filters' : ''}`}>
      {chips.length ? <><div className="table-filter-chips">{chips.map(chip => <button key={chip.key} onClick={chip.onRemove} className="table-filter-chip" aria-label={`Remove ${chip.label} filter`}>{chip.label}<span aria-hidden="true">×</span></button>)}</div><button className="table-clear" onClick={onClear}>Clear all</button></> : <span>No filters applied</span>}
    </div>
  </section>;
}

export function MultiSelectFilter({ label, values, options, onChange, emptyLabel = 'All', searchable = true }: { label: string; values: readonly string[]; options: readonly (string | { value: string; label: string })[]; onChange: (values: string[]) => void; emptyLabel?: string; searchable?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [popoverOffset, setPopoverOffset] = useState(0);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const normalized = options.map(option => typeof option === 'string' ? { value: option, label: option } : option);
  const items = [...normalized, ...values.filter(v => !normalized.some(option => option.value === v)).map(value => ({ value, label: value }))];
  const shown = items.filter(item => item.label.toLowerCase().includes(query.toLowerCase()));
  const summary = !values.length ? emptyLabel : values.length === 1 ? items.find(item => item.value === values[0])?.label || values[0] : `${values.length} selected`;
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const focusOutside = (event: FocusEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', focusOutside);
    document.addEventListener('keydown', escape);
    panel.current?.querySelector<HTMLInputElement>('input')?.focus();
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', focusOutside); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div className="table-filter-field" ref={root}>
    <span className="table-field-label" id={`${id}-label`}>{label}</span>
    <button ref={trigger} className={`table-filter-trigger ${values.length ? 'is-filtered' : ''}`} onClick={() => {
      const left = trigger.current?.getBoundingClientRect().left || 0;
      const width = Math.min(280, window.innerWidth - 40);
      const clamped = Math.max(20, Math.min(left, window.innerWidth - 20 - width));
      setPopoverOffset(clamped - left);
      setQuery(''); setOpen(v => !v);
    }} aria-labelledby={`${id}-label ${id}-value`} aria-expanded={open} aria-controls={open ? `${id}-panel` : undefined}>
      <span id={`${id}-value`}>{summary}</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    {open && <div ref={panel} id={`${id}-panel`} className="table-filter-popover" style={{ left: popoverOffset }} role="group" aria-label={`Choose ${label.toLowerCase()}`}>
      <div className="table-popover-heading"><strong>{label}</strong><button onClick={() => onChange([])} disabled={!values.length}>Clear</button></div>
      {searchable && <input className="table-filter-search" type="search" aria-label={`Search ${label.toLowerCase()}`} placeholder={`Search ${label.toLowerCase()}…`} value={query} onChange={event => setQuery(event.target.value)} />}
      <div className="table-filter-options">{shown.map(item => <label key={item.value}><input type="checkbox" checked={values.includes(item.value)} onChange={() => onChange(values.includes(item.value) ? values.filter(v => v !== item.value) : [...values, item.value])} /><span>{item.label}</span></label>)}{!shown.length && <p>No matches found.</p>}</div>
      <div className="table-popover-footer"><span>{values.length ? `${values.length} selected` : emptyLabel}</span><button onClick={() => { setOpen(false); trigger.current?.focus(); }}>Done</button></div>
    </div>}
  </div>;
}

export function SelectFilter({ label, value, options, onChange }: { label: string; value: string; options: readonly { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <label className="table-filter-field"><span className="table-field-label">{label}</span><select className="table-filter-trigger" value={value} onChange={event => onChange(event.target.value)}>{options.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>;
}

export function GroupByControl({ value, onChange }: { value: 'ticker' | 'brokerage'; onChange: (value: 'ticker' | 'brokerage') => void }) {
  return <div className="table-group-control" aria-label="Group table rows"><span>Group by</span><div>{(['ticker', 'brokerage'] as const).map(group => <button key={group} aria-pressed={group === value} className={group === value ? 'active' : ''} onClick={() => onChange(group)}>{group === 'ticker' ? 'Ticker' : 'Brokerage'}</button>)}</div></div>;
}

export function ColumnsButton({ count, total, onClick }: { count: number; total: number; onClick: () => void }) {
  return <button className="table-columns-button" onClick={onClick} aria-label={`Choose columns: ${count} of ${total} shown`}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16m6-16v16" /></svg>Columns<span>{count}/{total}</span></button>;
}
