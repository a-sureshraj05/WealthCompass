import React from 'react';
import type { StatementInspection } from './statementInspection';
import BrokerageLogo from './BrokerageLogo';

export default function StatementPreview({ inspection, brokerage, sourceName, busy, onEdit }: {
  inspection: StatementInspection; brokerage: string; sourceName: string; busy: boolean; onEdit: () => void;
}) {
  return <section className="ac-panel ac-statement-preview" aria-labelledby="ac-preview-title">
    <header className="ac-panel-head">
      <div>
        <p className="ac-eyebrow">CHECK YOUR SOURCE</p>
        <h2 id="ac-preview-title">Review your statement</h2>
        <p>Original export values, before server processing.</p>
      </div>
      <button className="ac-button" disabled={busy} onClick={onEdit}>← Edit source</button>
    </header>
    <div className="ac-source-summary">
      <BrokerageLogo name={brokerage} />
      <div>
        <strong>{brokerage}</strong>
        <span>{sourceName}</span>
      </div>
      <span className="ac-source-count">{inspection.rowCount.toLocaleString()} source {inspection.rowCount === 1 ? 'row' : 'rows'}</span>
    </div>
    <div className="ac-source-table">
      <table>
        <caption>First {inspection.rows.length} source rows · values shown as exported</caption>
        <thead>
          <tr>{inspection.columns.map(column => <th key={column} scope="col">{column}</th>)}</tr>
        </thead>
        <tbody>{inspection.rows.map((row, index) => <tr key={index}>{inspection.columns.map(column => <td key={column}>{row[inspection.headers.indexOf(column)] || '—'}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <div className="ac-preview-explanation">
      <strong>Source check complete</strong>
      <p>The expected {brokerage} headers are present. Action values are shown exactly as exported. Asset classification and transaction validation happen on the server when you import.</p>
      <p>Source rows can include activity that does not become a portfolio transaction. This preview does not calculate gains or cost basis.</p>
    </div>
  </section>;
}
