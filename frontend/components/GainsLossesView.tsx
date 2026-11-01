import React, { useMemo, useState } from 'react';
import { RealizedGain, UnrealizedLot } from '../types';
import { FilterToolbar, MultiSelectFilter, SelectFilter, selectionChips, TAX_TERM_OPTIONS } from './TableFilters';
import { formatCurrency } from '../utils/finance';
import { GainsMode, TaxTerm, normalizeGainRows, filterGainRows, summarizeGains, gainsByHolding, dailyGainMap, realizedByPeriod, clampTaxRate } from './GainsLosses/gainsModel';
import { RealizedGainsChart, GainsHeatmap, TaxTermBreakdown, signedMoney, signedPercent } from './GainsLosses/GainsCharts';
import GainLotTable from './GainsLosses/GainLotTable';
import GainsReconciliation from './GainsLosses/GainsReconciliation';
import './GainsLosses/gains-losses.css';

interface Props {
  realizedGains: RealizedGain[];
  unrealizedGains: UnrealizedLot[];
  selectedBrokerages: string[];
  setSelectedBrokerages: (values: string[]) => void;
  selectedTickers: string[];
  setSelectedTickers: (values: string[]) => void;
  stTaxRate: number;
  setStTaxRate: (value: number) => void;
  ltTaxRate: number;
  setLtTaxRate: (value: number) => void;
  numbersVisible?: boolean;
}

const countLabel = (count: number, label: string) => `${count} ${label}${count === 1 ? '' : 's'}`;

export default function GainsLossesView({ realizedGains, unrealizedGains, selectedBrokerages, setSelectedBrokerages, selectedTickers, setSelectedTickers, stTaxRate, setStTaxRate, ltTaxRate, setLtTaxRate, numbersVisible = true }: Props) {
  const [mode, setMode] = useState<GainsMode>('unrealized');
  const [year, setYear] = useState('all');
  const [terms, setTerms] = useState<TaxTerm[]>([]);
  const [expandedTerms, setExpandedTerms] = useState<Set<TaxTerm>>(new Set(['short', 'long']));
  const source = useMemo(() => normalizeGainRows(mode === 'realized' ? realizedGains : unrealizedGains, mode), [realizedGains, unrealizedGains, mode]);
  const rows = useMemo(() => filterGainRows(source, mode, { brokerages: selectedBrokerages, tickers: selectedTickers, terms, year }), [source, mode, selectedBrokerages, selectedTickers, terms, year]);
  const summary = useMemo(() => summarizeGains(rows, stTaxRate, ltTaxRate), [rows, stTaxRate, ltTaxRate]);
  const holdingResults = useMemo(() => gainsByHolding(rows), [rows]);
  const dailyResults = useMemo(() => dailyGainMap(rows), [rows]);
  const periods = useMemo(() => realizedByPeriod(rows, year), [rows, year]);
  const brokerages = [...new Set(source.map(row => row.brokerage))].sort();
  const tickers = [...new Set(source.map(row => row.ticker))].sort();
  const years = [...new Set([...realizedGains.map(row => row.sellDate.slice(0, 4)), ...(year !== 'all' ? [year] : [])])].sort().reverse();
  const mask = '••••••';
  const money = (value: number, signed = false) => numbersVisible ? signed ? signedMoney(value) : formatCurrency(value) : mask;
  const clear = () => { setSelectedBrokerages([]); setSelectedTickers([]); setTerms([]); setYear('all'); };
  const toggleTerm = (term: TaxTerm) => setExpandedTerms(previous => { const next = new Set(previous); next.has(term) ? next.delete(term) : next.add(term); return next; });

  return <div className="gains-workspace">
    <div className="gains-mode-row"><div className="workspace-segments" aria-label="Gain results type"><button aria-pressed={mode === 'unrealized'} className={mode === 'unrealized' ? 'active' : ''} onClick={() => setMode('unrealized')}>Unrealized<span>Open positions</span></button><button aria-pressed={mode === 'realized'} className={mode === 'realized' ? 'active' : ''} onClick={() => setMode('realized')}>Realized<span>Completed sales</span></button></div><p>{mode === 'unrealized' ? 'Paper gains and losses on the investments you still own.' : 'Recorded results from investments you have sold.'}</p></div>

    <FilterToolbar resultLabel={countLabel(rows.length, 'lot')} onClear={clear}
      chips={[
        ...selectionChips('Brokerage', selectedBrokerages, setSelectedBrokerages),
        ...selectionChips('Ticker', selectedTickers, setSelectedTickers),
        ...selectionChips('Tax term', terms, values => setTerms(values as TaxTerm[]), value => value === 'short' ? 'Short term' : 'Long term'),
        ...(mode === 'realized' && year !== 'all' ? [{ key: 'tax-year', label: `Tax year: ${year}`, onRemove: () => setYear('all') }] : []),
      ]}>
      <MultiSelectFilter label="Brokerage" values={selectedBrokerages} options={brokerages} onChange={setSelectedBrokerages} emptyLabel="All brokerages" />
      <MultiSelectFilter label="Ticker" values={selectedTickers} options={tickers} onChange={setSelectedTickers} emptyLabel="All tickers" />
      <MultiSelectFilter label="Tax term" values={terms} options={TAX_TERM_OPTIONS} onChange={values => setTerms(values as TaxTerm[])} emptyLabel="All terms" searchable={false} />
      {mode === 'realized' && <SelectFilter label="Tax year" value={year} onChange={setYear} options={[{ value: 'all', label: 'All years' }, ...years.map(value => ({ value, label: value }))]} />}
    </FilterToolbar>

    <GainsReconciliation rows={rows} mode={mode} numbersVisible={numbersVisible} />

    {numbersVisible ? mode === 'unrealized' ? (
      <div className="gains-heatmap-only"><GainsHeatmap overall={holdingResults} daily={dailyResults} /></div>
    ) : (
      <div className="gains-charts-grid"><RealizedGainsChart periods={periods} year={year} hasData={rows.length > 0} /><TaxTermBreakdown shortGain={summary.shortGain} longGain={summary.longGain} shortLots={summary.shortLots} longLots={summary.longLots} /></div>
    ) : <div className="gains-privacy-placeholder"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg><strong>Your portfolio figures are hidden</strong><p>Use Show figures in the header to reveal charts and lot details.</p></div>}

    <section className="gains-tax-assumptions" aria-label="Tax rate assumptions"><div><h2>Tax assumptions</h2><p>Shared with Gain to Sell in Holdings. These are adjustable inputs, not your actual tax liability.</p></div><div className="gains-tax-controls"><div className="gains-tax-impact"><span>{mode === 'unrealized' ? 'Illustrative tax if sold' : 'Illustrative tax estimate'}</span><strong>{money(summary.tax.total)}</strong><small>ST {money(summary.tax.shortTax)} · LT {money(summary.tax.longTax)}</small></div><div className="gains-rate-fields"><label><span><i className="gains-short-dot" />Short-term rate</span><div><input aria-label="Short-term tax rate percent" type="number" min="0" max="100" step="0.1" value={stTaxRate} onChange={event => setStTaxRate(clampTaxRate(Number(event.target.value)))} /><span>%</span></div></label><label><span><i className="gains-long-dot" />Long-term rate</span><div><input aria-label="Long-term tax rate percent" type="number" min="0" max="100" step="0.1" value={ltTaxRate} onChange={event => setLtTaxRate(clampTaxRate(Number(event.target.value)))} /><span>%</span></div></label></div></div><p className="gains-tax-method">The estimate uses the existing simplified offset between short- and long-term net gains, then applies these rates to remaining positive gains. It is based only on the filtered records shown here.</p></section>

    {numbersVisible && <section className="gains-detail-section"><header className="gains-detail-heading"><div><p className="gains-eyebrow">FROM THE TOTAL TO EACH TAX LOT</p><h2>Lot breakdown</h2><p>Grouped by tax term and asset type. Expand a holding to inspect its individual lots.</p></div><span>{countLabel(rows.length, 'lot')} in this view</span></header>
      {!rows.length ? <div className="table-no-results"><strong>{source.length ? 'No lots match these filters' : mode === 'realized' ? 'No completed sales yet' : 'No open lots yet'}</strong><p>{source.length ? 'Remove a filter or choose a different year to see more results.' : 'Your results will appear after transactions are imported and processed.'}</p>{source.length > 0 && <button onClick={clear}>Clear all filters</button>}</div> : (['short', 'long'] as const).map(term => {
        const lots = rows.filter(row => row.term === term);
        if (!lots.length) return null;
        const total = summarizeGains(lots, stTaxRate, ltTaxRate);
        const open = expandedTerms.has(term);
        return <section key={term} className="gains-term-section" data-term={term}><button className="gains-term-heading" aria-expanded={open} onClick={() => toggleTerm(term)}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true" style={{ transform: open ? 'rotate(90deg)' : undefined }}><path d="m9 5 7 7-7 7" /></svg><div><strong><i className={term === 'short' ? 'gains-short-dot' : 'gains-long-dot'} />{term === 'short' ? 'Short-term' : 'Long-term'} positions</strong><span>{countLabel(lots.length, 'lot')} · based on recorded tax-term classification</span></div><div className="gains-term-total"><strong className={total.gain >= 0 ? 'gain-positive' : 'gain-negative'}>{signedMoney(total.gain)}</strong><span>{signedPercent(total.percent)} on cost basis</span></div></button>{open && <div className="gains-term-content">{[false, true].map(isOption => { const group = lots.filter(row => row.isOption === isOption); return group.length ? <GainLotTable key={isOption ? 'options' : 'stocks'} rows={group} mode={mode} isOption={isOption} /> : null; })}</div>}</section>;
      })}
    </section>}
    <p className="gains-page-footnote">P&amp;L values come from the recorded lots. Percentage figures compare P&amp;L with positive cost basis; they are not annualized or cash-flow-adjusted returns. Daily map figures exclude options and missing previous-close quotes.</p>
  </div>;
}
