import React from 'react';
import { formatCurrency } from '../../utils/finance';
import type { portfolioModel } from './portfolioModel';
import type { HeatmapMode } from '../GainsLosses/GainsCharts';

interface Props {
  model: ReturnType<typeof portfolioModel>;
  numbersVisible: boolean;
  onHoldings: () => void;
  onHeatmap?: (period: HeatmapMode) => void;
  onAccounts: () => void;
}

const Chevron = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>;
const TileIcon = ({ kind }: { kind: 'portfolio' | 'daily' | 'unrealized' | 'cash' }) => {
  const paths = { portfolio: 'M4 8h16v12H4zM8 8V4h8v4M4 13h16', daily: 'm3 17 6-6 4 4 8-10m-6 0h6v6', unrealized: 'M12 3v18m5-14H9a3 3 0 000 6h6a3 3 0 010 6H6', cash: 'M4 6h16v14H4zM4 10h16m-5 4h5v3h-5z' };
  return <span className={`summary-tile-symbol ${kind}`}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg></span>;
};

export default function OverviewSummaryTiles({ model, numbersVisible, onHoldings, onHeatmap, onAccounts }: Props) {
  const mask = '••••••';
  const money = (value: number, signed = false) => !numbersVisible ? mask : signed ? `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatCurrency(Math.abs(value))}` : formatCurrency(value);
  const percent = (value: number | null) => !numbersVisible ? mask : value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
  const positiveAssets = Math.max(0, model.investmentValue) + Math.max(0, model.cashValue);
  const investedShare = positiveAssets ? Math.max(0, model.investmentValue) / positiveAssets * 100 : 0;
  const dailyAvailable = model.contributors.length > 0;
  return <section className="overview-summary-actions" aria-label="Portfolio summary shortcuts">
    <button type="button" className="summary-tile summary-tile--portfolio" onClick={onHoldings} aria-label="View holdings — total portfolio value">
      <span className="summary-tile-heading"><span>Total portfolio value</span><TileIcon kind="portfolio" /></span>
      <strong className="summary-tile-value">{money(model.totalValue)}</strong>
      <span className="summary-tile-caption">Across your selected brokerages</span>
      {numbersVisible && positiveAssets > 0 && <span className="summary-capital-track" aria-hidden="true"><span style={{ width: `${investedShare}%` }} /></span>}
      <span className="summary-capital-details"><span><i />Invested<strong>{money(model.investmentValue)}</strong></span><span><i />{model.cashValue < 0 ? 'Margin' : 'Cash'}<strong>{money(model.cashValue)}</strong></span></span>
      <span className="summary-tile-link">View holdings<Chevron /></span>
    </button>
    <button type="button" className="summary-tile summary-tile--daily" onClick={() => onHeatmap?.('daily')} disabled={!onHeatmap} aria-label="View daily change in the Gains and Losses Day heatmap">
      <span className="summary-tile-heading"><span>Daily equity change</span><TileIcon kind="daily" /></span>
      <strong className={`summary-tile-value${numbersVisible && dailyAvailable ? model.dayChange >= 0 ? ' is-positive' : ' is-negative' : ''}`}>{dailyAvailable ? money(model.dayChange, true) : '—'}</strong>
      <span className="summary-tile-caption">{percent(model.dayPercent)} vs. previous close</span>
      <span className="summary-tile-link">Day heatmap<Chevron /></span>
    </button>
    <button type="button" className="summary-tile summary-tile--unrealized" onClick={() => onHeatmap?.('overall')} disabled={!onHeatmap} aria-label="View unrealized gains and losses in the Open P and L heatmap">
      <span className="summary-tile-heading"><span>Unrealized gain / loss</span><TileIcon kind="unrealized" /></span>
      <strong className={`summary-tile-value${numbersVisible ? model.gain >= 0 ? ' is-positive' : ' is-negative' : ''}`}>{money(model.gain, true)}</strong>
      <span className="summary-tile-caption">{percent(model.gainPercent)} on open-position cost</span>
      <span className="summary-tile-link">Open P&amp;L heatmap<Chevron /></span>
    </button>
    <button type="button" className="summary-tile summary-tile--cash" onClick={onAccounts} aria-label="View accounts and imports — cash balances">
      <span className="summary-tile-heading"><span>{model.cashValue < 0 ? 'Net cash / margin' : 'Cash balance'}</span><TileIcon kind="cash" /></span>
      <span className="summary-cash-body"><strong className="summary-tile-value">{money(model.cashValue)}</strong><span className="summary-tile-caption">{model.brokers.length} brokerages in this view</span></span>
      <span className="summary-tile-link">View accounts<Chevron /></span>
    </button>
  </section>;
}
