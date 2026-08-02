import React from 'react';

interface Props<T extends string> {
  open: boolean;
  onClose: () => void;
  order: readonly T[];
  labels: Record<string, string>;
  onMove: (col: T, direction: -1 | 1) => void;
}

/**
 * Reorder columns by tapping arrows instead of dragging.
 *
 * The table headers use HTML5 drag-and-drop, which never fires from touch
 * input — iOS Safari emits no dragstart for a finger — so on a phone the
 * columns simply could not be reordered. Arrows work with both mouse and
 * touch, and are far more precise than dragging a narrow header on a
 * small screen.
 *
 * Desktop drag-and-drop is untouched; this is an additional path, not a
 * replacement.
 */
function ColumnOrderSheet<T extends string>({ open, onClose, order, labels, onMove }: Props<T>) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Reorder columns"
    >
      <div
        className="bg-white w-full sm:w-96 sm:rounded rounded-t-2xl max-h-[75vh] flex flex-col shadow-2xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E5EA]">
          <span className="text-sm font-bold text-slate-700">Reorder Columns</span>
          <button
            onClick={onClose}
            className="text-[11px] font-bold text-[#0F52BA] uppercase tracking-widest px-2 py-2 min-h-[44px]"
          >
            Done
          </button>
        </div>

        <div className="overflow-y-auto p-2">
          {order.map((col, i) => (
            <div
              key={col}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded hover:bg-slate-50"
            >
              <span className="text-sm font-medium text-slate-700 truncate">
                <span className="text-slate-300 mr-2 tabular-nums">{i + 1}</span>
                {labels[col] ?? col}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => onMove(col, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${labels[col] ?? col} earlier`}
                  className="w-11 h-11 flex items-center justify-center rounded text-slate-500 disabled:text-slate-200 hover:bg-slate-100 disabled:hover:bg-transparent"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  onClick={() => onMove(col, 1)}
                  disabled={i === order.length - 1}
                  aria-label={`Move ${labels[col] ?? col} later`}
                  className="w-11 h-11 flex items-center justify-center rounded text-slate-500 disabled:text-slate-200 hover:bg-slate-100 disabled:hover:bg-transparent"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ColumnOrderSheet;
