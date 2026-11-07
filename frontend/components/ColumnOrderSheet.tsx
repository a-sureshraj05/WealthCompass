import React, { useEffect, useId, useRef } from 'react';
import './table-controls.css';

interface Props<T extends string> {
  open: boolean;
  onClose: () => void;
  order: readonly T[];
  labels: Record<string, string>;
  onMove: (col: T, direction: -1 | 1) => void;
  visible?: readonly T[];
  required?: readonly T[];
  onToggle?: (col: T) => void;
  onReset?: () => void;
  presets?: Record<string, readonly T[]>;
  onPreset?: (columns: readonly T[]) => void;
}

/** Shared mouse, keyboard and touch controls for table visibility and order. */
function ColumnOrderSheet<T extends string>({ open, onClose, order, labels, onMove, visible = order, required = [], onToggle, onReset, presets, onPreset }: Props<T>) {
  const panel = useRef<HTMLDivElement>(null);
  const done = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    done.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key === 'Tab') {
        const controls = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') || [])];
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); previous?.focus(); };
  }, [open]);
  if (!open) return null;
  return <div className="table-settings-backdrop" onClick={onClose}>
    <div ref={panel} className="table-settings-panel" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onClick={event => event.stopPropagation()}>
      <header className="table-settings-header"><div><p>MAKE THIS TABLE YOURS</p><h2 id={`${id}-title`}>Columns</h2></div><button ref={done} onClick={onClose}>Done</button></header>
      <p className="table-settings-description" id={`${id}-description`}>Choose the columns you need. Use the arrows to change their order.</p>
      {onPreset && <div className="table-column-presets">{Object.entries({ ...presets, 'All columns': order }).map(([name, columns]) => <button key={name} aria-pressed={columns.length === visible.length && columns.every(column => visible.includes(column))} onClick={() => onPreset(columns)}>{name}</button>)}</div>}
      <div className="table-settings-count"><span>{visible.length} of {order.length} columns shown</span>{onReset && <button onClick={onReset}>Restore default layout</button>}</div>
      <div className="table-settings-list">{order.map((column, index) => <div className={`table-settings-row ${!visible.includes(column) ? 'is-hidden' : ''}`} key={column}>
        {onToggle && <input id={`${id}-${column}`} type="checkbox" checked={visible.includes(column)} disabled={required.includes(column)} aria-label={`Show ${labels[column] || column}`} onChange={() => onToggle(column)} />}
        <label className="table-settings-column" htmlFor={`${id}-${column}`}><span>{labels[column] || column}</span>{required.includes(column) && <small>Always shown</small>}</label>
        <div className="table-column-arrows"><button onClick={() => onMove(column, -1)} disabled={index === 0} aria-label={`Move ${labels[column] || column} earlier`}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 14 6-6 6 6" /></svg></button><button onClick={() => onMove(column, 1)} disabled={index === order.length - 1} aria-label={`Move ${labels[column] || column} later`}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 10 6 6 6-6" /></svg></button></div>
      </div>)}</div>
      <footer className="table-settings-footer">Layout changes are saved automatically.</footer>
    </div>
  </div>;
}

export default ColumnOrderSheet;
