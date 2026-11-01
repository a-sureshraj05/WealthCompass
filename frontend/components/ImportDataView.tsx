import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { parseStatement, getBrokerageConnectUrl, fetchBrokerageConnections, fetchBrokerageAccounts, ignoreBrokerageAccount, syncBrokerageTransactions, deleteBrokerageConnection, deleteRawData } from '../services/apiService';
import type { BrokerageConnection, ProviderAccount } from '../services/apiService';
import type { Transaction } from '../types';
import { buildSyncRequest, normalizeSyncTickers, validateStatementFile, MAX_STATEMENT_BYTES } from './Accounts/accountsModel';
import type { SyncScope, SyncPeriod } from './Accounts/accountsModel';
import AccountConnections from './Accounts/AccountConnections';
import BrokerageLogo from './Accounts/BrokerageLogo';
import StatementPreview from './Accounts/StatementPreview';
import { inspectStatement } from './Accounts/statementInspection';
import './Accounts/accounts.css';

interface Props {
  onAddTransactions: (t: Transaction[]) => void;
  setLoading: (l: boolean) => void;
  initialTab?: 'manual' | 'connect';
  onRefresh?: () => void | Promise<unknown>;
  onViewTransactions?: () => void;
}

type Notice = { kind: 'success' | 'error' | 'info'; text: string; };
const CONNECT_BROKERS = ['Fidelity', 'Schwab', 'Robinhood', 'Other'];
// These are the production CSV parser configurations, not the connection catalog.
const IMPORT_BROKERS = ['Robinhood', 'Schwab'];
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';

export default function ImportDataView({ onAddTransactions, initialTab = 'connect', onRefresh, onViewTransactions }: Props) {
  const preview = import.meta.env.DEV && typeof window !== 'undefined' && window.location.pathname === '/design-preview';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [connections, setConnections] = useState<BrokerageConnection[]>([]);
  const [accounts, setAccounts] = useState<ProviderAccount[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [refreshedAt, setRefreshedAt] = useState('');
  const [pending, setPending] = useState('');
  const operation = useRef(false);
  const mounted = useRef(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [connectBroker, setConnectBroker] = useState('Fidelity');
  const [scope, setScope] = useState<SyncScope>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [period, setPeriod] = useState<SyncPeriod>('history');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [tickerInput, setTickerInput] = useState('');
  const [broker, setBroker] = useState('');
  const [source, setSource] = useState<'file' | 'paste'>('file');
  const [fileText, setFileText] = useState('');
  const [fileName, setFileName] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [importedBroker, setImportedBroker] = useState('');
  const [importHasLedger, setImportHasLedger] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = !!pending;
  const statementText = source === 'file' ? fileText : pasteText;
  const effectiveTickers = normalizeSyncTickers(tickerInput);
  const activeIds = scope === 'all' ? accounts.map(a => a.id) : selectedIds;
  const tooLarge = useMemo(() => new TextEncoder().encode(statementText).length > MAX_STATEMENT_BYTES, [statementText]);
  const inspection = useMemo(() => tooLarge ? { headers: [], columns: [], rows: [], rowCount: 0, error: 'The statement exceeds the 5 MB limit.' } : inspectStatement(statementText, broker), [statementText, broker, tooLarge]);
  const canReview = !!broker && !!statementText.trim() && !inspection.error;
  const importReady = reviewing && canReview && acknowledged;
  const selectedAccounts = loadError ? [] : accounts.filter(account => activeIds.includes(account.id));
  const importStep = reviewing ? 3 : broker ? 2 : 1;
  let syncError = '';
  try { buildSyncRequest({ scope, selectedIds, availableIds: accounts.map(a => a.id), period, start, end, tickerInput }); }
  catch (error) { syncError = errorText(error); }

  const loadConnections = useCallback(async () => {
    try {
      const [nextConnections, nextAccounts] = await Promise.all([fetchBrokerageConnections(), fetchBrokerageAccounts()]);
      if (!mounted.current) return;
      setConnections(nextConnections);
      setAccounts(nextAccounts);
      setSelectedIds(ids => ids.filter(id => nextAccounts.some(a => a.id === id)));
      setLoadError('');
      setRefreshedAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    } catch (error) {
      if (mounted.current) setLoadError(errorText(error));
      throw error;
    } finally { if (mounted.current) setLoaded(true); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void loadConnections().catch(() => { });
    return () => { mounted.current = false; };
  }, [loadConnections]);

  const run = async (name: string, task: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true;
    setPending(name);
    setNotice(null);
    try { await task(); }
    catch (error) { if (mounted.current) setNotice({ kind: 'error', text: errorText(error) }); }
    finally { operation.current = false; if (mounted.current) setPending(''); }
  };

  const refreshPortfolio = async () => {
    try { await onRefresh?.(); return ''; }
    catch { return ' The operation completed, but the portfolio view could not refresh. Reload the page to see the latest records.'; }
  };
  const refreshAfterManagement = async (message: string) => {
    let warning = '';
    try { await loadConnections(); }
    catch { warning = ' The account list could not refresh. Refresh it before synchronizing.'; }
    warning += await refreshPortfolio();
    setNotice({ kind: warning ? 'info' : 'success', text: message + warning });
  };
  const switchTab = (tab: 'connect' | 'manual') => { setActiveTab(tab); setNotice(null); };
  const toggleAccount = (id: string) => {
    setScope('selected');
    setSelectedIds(ids => scope === 'all' ? accounts.filter(a => a.id !== id).map(a => a.id) : ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]);
  };

  const connect = () => {
    if (preview) { setNotice({ kind: 'info', text: 'Design preview: brokerage sign-in is disabled. Explore the fictional connections below.' }); return; }
    if (operation.current) return;
    // Open during the click, before awaiting the provider URL, to avoid popup blockers.
    const popup = window.open('about:blank', '_blank');
    if (!popup) { setNotice({ kind: 'error', text: 'Allow a new tab for this site, then try connecting again.' }); return; }
    popup.opener = null;
    void run('connect', async () => {
      try {
        const url = new URL(await getBrokerageConnectUrl(connectBroker));
        if (!['https:', 'http:'].includes(url.protocol)) throw new Error('The provider returned an invalid sign-in link.');
        if (popup.closed) throw new Error('The sign-in tab was closed. Try connecting again.');
        popup.location.href = url.href;
        setNotice({ kind: 'info', text: 'Complete brokerage sign-in in the new tab, then return here and refresh accounts.' });
      } catch (error) { popup.close(); throw error; }
    });
  };

  const sync = () => void run('sync', async () => {
    if (!loaded || loadError) throw new Error('Refresh the account list before synchronizing.');
    const request = buildSyncRequest({ scope, selectedIds, availableIds: accounts.map(a => a.id), period, start, end, tickerInput });
    const result = await syncBrokerageTransactions(request.startDate, request.endDate, request.accountIds, request.tickers);
    const warning = await refreshPortfolio();
    setNotice({ kind: warning ? 'info' : 'success', text: result.message + warning });
  });

  const manage = (kind: 'hide' | 'disconnect', id: string, name: string) => {
    if (preview) { setNotice({ kind: 'info', text: 'Design preview: hiding accounts and disconnecting brokerages are disabled.' }); return; }
    const prompt = kind === 'hide' ? `Hide “${name}” from future synchronization? This keeps the brokerage connection.` : `Disconnect ${name} from WealthCompass? You will need to connect again to synchronize it.`;
    if (!window.confirm(prompt)) return;
    void run(kind, async () => {
      if (kind === 'hide') await ignoreBrokerageAccount(id);
      else await deleteBrokerageConnection(id);
      await refreshAfterManagement(kind === 'hide' ? `${name} hidden from future synchronization.` : `${name} disconnected.`);
    });
  };

  const readFile = (file?: File) => {
    if (!file) return;
    void run('file', async () => {
      setFileText(''); setFileName(''); setAcknowledged(false); setReviewing(false); setImportedBroker('');
      validateStatementFile(file);
      const text = await file.text();
      if (!text.trim()) throw new Error('This statement has no content. Choose another export.');
      setFileText(text); setFileName(file.name);
    });
  };

  const importStatement = () => void run('import', async () => {
    if (!importReady) throw new Error('Choose a brokerage, add a statement and confirm replacement before importing.');
    const transactions = await parseStatement(statementText.replace(/^\uFEFF/, ''), broker);
    let warning = '';
    // The live response is one brokerage's ledger, not the complete portfolio.
    // Reload all datasets when possible instead of replacing unrelated rows.
    try { if (preview || !onRefresh) onAddTransactions(transactions); }
    catch { warning = ' The statement was saved, but the local ledger could not update.'; }
    warning += await refreshPortfolio();
    setImportedBroker(broker); setImportHasLedger(transactions.length > 0); setFileName(''); setFileText(''); setPasteText(''); setAcknowledged(false); setReviewing(false);
    if (fileInput.current) fileInput.current.value = '';
    setNotice({ kind: warning ? 'info' : 'success', text: `${preview ? 'Sample statement processed' : 'Statement processed'} for ${broker}.${warning}` });
  });

  const deleteSource = (source?: 'manual' | 'snaptrade') => {
    if (preview) { setNotice({ kind: 'info', text: 'Design preview: deleting source data is disabled.' }); return; }
    const label = source === 'manual' ? 'all manual statement source records' : source === 'snaptrade' ? 'all SnapTrade source records' : 'ALL source and processed portfolio data';
    if (!window.confirm(`Permanently delete ${label}? This also clears ALL transactions, holdings and gains. Source records from the other import method are kept. This cannot be undone.`)) return;
    void run('delete', async () => {
      const result = await deleteRawData(source);
      const warning = await refreshPortfolio();
      setNotice({ kind: warning ? 'info' : 'success', text: result.message + warning });
    });
  };

  return <div className="ac-workspace" aria-busy={busy}>
    <div className="ac-toolbar">
      <div className="workspace-segments" aria-label="Account workspace">
        <button className={activeTab === 'connect' ? 'active' : ''} aria-pressed={activeTab === 'connect'} disabled={busy} onClick={() => switchTab('connect')}>Connected accounts</button>
        <button className={activeTab === 'manual' ? 'active' : ''} aria-pressed={activeTab === 'manual'} disabled={busy} onClick={() => switchTab('manual')}>Statement import</button>
      </div>
      <span className="ac-toolbar-note">{activeTab === 'connect' ? 'Choose the accounts. Control the sync.' : 'Bring in the history behind your portfolio.'}</span>
    </div>
    {notice && <div className={`ac-notice is-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
      <strong>{notice.kind === 'error' ? 'Action needed' : notice.kind === 'success' ? 'Completed' : 'Please note'}</strong>
      <span>{notice.text}</span>
    </div>}

    {activeTab === 'connect' ? <div className="ac-layout">
      <div className="ac-main-stack">
        <AccountConnections connections={connections} accounts={accounts} loaded={loaded} loadError={loadError}
          refreshedAt={refreshedAt} busy={busy} refreshing={pending === 'refresh'} scope={scope}
          selectedIds={selectedIds} onToggle={toggleAccount} onManage={manage}
          onSelection={(ids, nextScope) => { setSelectedIds(ids); setScope(nextScope); }}
          onRefresh={() => void run('refresh', async () => { await loadConnections(); setNotice({ kind: 'success', text: 'Connections and accounts refreshed.' }); })} />
        <section className="ac-panel ac-add-connection" aria-labelledby="ac-add">
          <div>
            <p className="ac-eyebrow">GROW YOUR WORKSPACE</p>
            <h2 id="ac-add">Add a brokerage</h2>
            <p>Sign in through the brokerage connection portal. Return here to refresh your account list.</p>
          </div>
          <div className="ac-connect-catalog" aria-label="Brokerage to connect">
            {CONNECT_BROKERS.map(name => <button key={name} className={connectBroker === name ? 'is-selected' : ''} disabled={busy} aria-pressed={connectBroker === name} onClick={() => setConnectBroker(name)}>
              <BrokerageLogo name={name} />
              <span>{name === 'Other' ? 'More brokers' : name}</span>
            </button>)}
          </div>
          <div className="ac-connect-footer">
            <span>{connectBroker === 'Other' ? 'Choose a provider in the connection portal.' : `Connect another ${connectBroker} account through the sign-in portal.`}</span>
            <button className="ac-button ac-primary" disabled={busy} onClick={connect}>{pending === 'connect' ? 'Opening…' : `Connect ${connectBroker === 'Other' ? 'brokerage' : connectBroker} ↗`}</button>
          </div>
        </section>
      </div>
      <aside className="ac-panel ac-sync-panel" aria-labelledby="ac-sync">
        <header>
          <p className="ac-eyebrow">ON YOUR TERMS</p>
          <h2 id="ac-sync">Synchronize activity</h2>
          <p>Import activity from the accounts and period you choose.</p>
        </header>
        <fieldset disabled={busy || !loaded || !!loadError}>
          <legend>Choose the period</legend>
          <label className="ac-field">Activity period<select value={period} onChange={e => setPeriod(e.target.value as SyncPeriod)}>
            <option value="history">Available history</option>
            <option value="ytd">Year to date</option>
            <option value="custom">Custom dates</option>
          </select>
          </label>{period === 'custom' && <div className="ac-date-fields">
            <label className="ac-field">From<input type="date" value={start} onChange={e => setStart(e.target.value)} />
            </label>
            <label className="ac-field">Through<input type="date" value={end} min={start || undefined} onChange={e => setEnd(e.target.value)} />
            </label>
          </div>}<details className="ac-optional-filters">
            <summary>Limit to specific tickers <span>optional</span>
            </summary>
            <label className="ac-field">Tickers<input value={tickerInput} onChange={e => setTickerInput(e.target.value)} placeholder="AAPL, MSFT, VTI" autoCapitalize="characters" spellCheck={false} />
            </label>
            <p className="ac-help">Separate tickers with commas or spaces. Leave blank for all tickers.</p>
          </details>
        </fieldset>
        <div className="ac-sync-review">
          <span>YOUR NEXT SYNC</span>
          <strong>{activeIds.length} {activeIds.length === 1 ? 'account' : 'accounts'} · {period === 'history' ? 'available history' : period === 'ytd' ? 'year to date' : 'custom dates'}</strong>
          <p>{effectiveTickers.length ? effectiveTickers.join(' · ') : 'All tickers'}{period === 'custom' && ` · ${start || 'earliest available'} → ${end || 'latest available'}`}</p>
          {!!selectedAccounts.length && <ul className="ac-sync-accounts">{selectedAccounts.map(account => <li key={account.id}>
            <BrokerageLogo name={account.brokerage} />
            <span>{account.name || 'Brokerage account'}<small>{account.brokerage}</small>
            </span>
          </li>)}</ul>}
        </div>
        {loaded && !loadError && syncError && <p className="ac-validation">{syncError}</p>}<button className="ac-button ac-primary ac-full" disabled={busy || !loaded || !!loadError || !!syncError} onClick={sync}>{pending === 'sync' ? 'Synchronizing…' : 'Sync transactions →'}</button>
        <p className="ac-help ac-sync-footnote">Available history depends on your brokerage. This action synchronizes transactions; it does not place trades.</p>
      </aside>
    </div> : <div className="ac-import-workflow">
      <ol className="ac-steps" aria-label="Statement import progress">{['Choose format', 'Add source', 'Review & import'].map((label, index) => <li key={label} className={index + 1 < importStep ? 'is-complete' : index + 1 === importStep ? 'is-current' : ''} aria-current={index + 1 === importStep ? 'step' : undefined}>
        <span>{index + 1 < importStep ? '✓' : index + 1}</span>{label}</li>)}</ol>
      <div className="ac-layout ac-import-layout">
        {reviewing ? <StatementPreview inspection={inspection} brokerage={broker} sourceName={source === 'file' ? fileName : 'Pasted CSV'} busy={busy} onEdit={() => { setReviewing(false); setAcknowledged(false); }} /> : <section className="ac-panel ac-import-editor" aria-labelledby="ac-statement">
          <header>
            <p className="ac-eyebrow">HISTORY, WITH CONTEXT</p>
            <h2 id="ac-statement">Prepare your statement</h2>
            <p>Select the export format, then add the file or paste its CSV contents.</p>
          </header>
          <fieldset disabled={busy}>
            <legend>1. Choose the export format</legend>
            <div className="ac-broker-choices">{IMPORT_BROKERS.map(name => <button key={name} className={broker === name ? 'is-selected' : ''} aria-pressed={broker === name} onClick={() => { setBroker(name); setAcknowledged(false); setReviewing(false); setImportedBroker(''); }}>
              <BrokerageLogo name={name} />
              <span>{name}<small>Transaction CSV</small>
              </span>
              <span className="ac-choice-dot" />
            </button>)}</div>
            <p className="ac-help">CSV templates currently supported: Robinhood and Schwab. Use brokerage connections for other providers. PDF statements are not supported.</p>
          </fieldset>
          <fieldset disabled={busy}>
            <legend>2. Add your statement</legend>
            <div className="ac-source-tabs" aria-label="Statement source">
              <button className={source === 'file' ? 'active' : ''} aria-pressed={source === 'file'} onClick={() => { setSource('file'); setAcknowledged(false); setReviewing(false); }}>Upload file</button>
              <button className={source === 'paste' ? 'active' : ''} aria-pressed={source === 'paste'} onClick={() => { setSource('paste'); setAcknowledged(false); setReviewing(false); }}>Paste CSV</button>
            </div>{source === 'file' ? <>
              <div className={`ac-dropzone ${fileName ? 'has-file' : ''}`}>
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M8 13h8m-8 4h6" />
                </svg>
                <strong>{fileName || 'Choose a transaction export'}</strong>
                <p>{fileName ? 'File ready for review. Nothing has been imported yet.' : 'CSV or TXT · up to 5 MB'}</p>
                <input ref={fileInput} aria-label="Statement file" type="file" accept=".csv,.txt" onChange={e => { readFile(e.target.files?.[0]); e.target.value = ''; }} />
                <button className="ac-button" onClick={() => fileInput.current?.click()}>{pending === 'file' ? 'Reading file…' : fileName ? 'Choose another file' : 'Browse files'}</button>
              </div>{fileText && <details className="ac-content-preview">
                <summary>View file contents <span>first 1,800 characters</span>
                </summary>
                <pre>{fileText.slice(0, 1800)}</pre>
              </details>}</> : <label className="ac-field ac-paste-label">CSV contents<textarea value={pasteText} onChange={e => { setPasteText(e.target.value); setAcknowledged(false); setReviewing(false); setImportedBroker(''); }} placeholder="Paste the header row and transaction rows from your brokerage export…" rows={10} spellCheck={false} />
              <span className="ac-help">Keep the original column names and date format. This is a source preview; records are parsed when you import.</span>
            </label>}{tooLarge && <p className="ac-validation" role="alert">The statement exceeds the 5 MB limit.</p>}
            {preview && <button className="ac-sample-button" onClick={() => { setBroker('Schwab'); setSource('paste'); setPasteText('Date,Action,Symbol,Description,Quantity,Price,Commissions & Fees,Amount,Settlement Date\n2025-06-10,Buy,AAPL,Apple Inc,10,150,0,-1500,2025-06-11'); setAcknowledged(false); setReviewing(false); setImportedBroker(''); setNotice(null); }}>Try a fictional sample export →</button>}</fieldset>
        </section>}
        <aside className="ac-import-side">
          <section className="ac-panel ac-import-review" aria-labelledby="ac-review">
            <p className="ac-eyebrow">BEFORE YOU IMPORT</p>
            <h2 id="ac-review">{reviewing ? 'Ready to import?' : 'Your import'}</h2>
            <dl>
              <div>
                <dt>Brokerage</dt>
                <dd className="ac-review-broker">{broker && <BrokerageLogo name={broker} />}{broker || 'Choose a format'}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{source === 'file' ? fileName || 'No file selected' : pasteText.trim() ? 'Pasted CSV' : 'No content added'}</dd>
              </div>
              <div>
                <dt>Destination</dt>
                <dd>{preview ? 'Fictional preview ledger' : 'Your portfolio ledger'}</dd>
              </div>
            </dl>
            {!!broker && !!statementText.trim() && inspection.error && <p className="ac-validation" role="alert">{inspection.error}</p>}
            {canReview && <div className="ac-format-match">
              <span>✓</span>
              <div>
                <strong>{broker} headers found</strong>
                <small>{inspection.rowCount.toLocaleString()} source {inspection.rowCount === 1 ? 'row' : 'rows'} · ready for review</small>
              </div>
            </div>}
            <div className="ac-replace-note">
              <strong>This replaces manual history</strong>
              <p>Existing manually imported records for {broker || 'the selected brokerage'} are replaced. Brokerage-synced records and verified seed transactions are kept.</p>
            </div>
            {reviewing && <label className="ac-acknowledge">
              <input type="checkbox" checked={acknowledged} disabled={busy || !broker || !statementText.trim() || tooLarge} onChange={e => setAcknowledged(e.target.checked)} />
              <span>I understand this replaces the selected brokerage’s manual import history.</span>
            </label>}
            {reviewing ? <button className="ac-button ac-primary ac-full" disabled={busy || !importReady} onClick={importStatement}>{pending === 'import' ? 'Importing statement…' : 'Import statement →'}</button> : <button className="ac-button ac-primary ac-full" disabled={busy || !canReview} onClick={() => { setReviewing(true); setAcknowledged(false); setNotice(null); }}>Review statement →</button>}
            <p className="ac-help">{preview ? 'Preview imports create fictional example rows only. No statement is sent to a server.' : 'The statement is sent to the server only when you select Import statement.'}</p>
          </section>
          {importedBroker && <section className="ac-import-result" role="status">
            <span>✓</span>
            <div>
              <h3>{preview ? 'Sample statement processed' : 'Statement processed'}</h3>
              <p>{importHasLedger ? `${importedBroker} statement saved. Review the combined brokerage ledger below.` : `${importedBroker} source statement saved. No ledger records were returned; manual history fills gaps before brokerage-synced coverage.`}</p>{onViewTransactions && <button disabled={busy} onClick={onViewTransactions}>View transactions →</button>}</div>
          </section>}
          <section className="ac-import-guide">
            <h3>Make your history useful</h3>
            <p>Use a full transaction export rather than a holdings snapshot. Manual rows extend history before each ticker’s earliest brokerage-synced transaction; other rows stay in source history. Sync the brokerage first to establish coverage.</p>
            <p>Keep the original header row. Export formats can vary; the parser will report missing columns before replacing records.</p>
          </section>
        </aside>
      </div>
    </div>}

    <details className="ac-management">
      <summary>Advanced data management <span>Remove source records or reset portfolio data</span>
      </summary>
      <div>
        <p>Deleting either source also clears all transactions, holdings and gains. Source records from the other method are kept. These actions cannot be undone.</p>
        <div className="ac-management-actions">
          <button className="ac-button ac-danger" disabled={busy} onClick={() => deleteSource('manual')}>Delete manual source records</button>
          <button className="ac-button ac-danger" disabled={busy} onClick={() => deleteSource('snaptrade')}>Delete SnapTrade source records</button>
          <button className="ac-button ac-danger" disabled={busy} onClick={() => deleteSource()}>Reset all portfolio data</button>
        </div>
      </div>
    </details>
  </div>;
}
