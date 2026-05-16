import React, { useState, useEffect, useCallback } from 'react';
import { parseStatement, getBrokerageConnectUrl, fetchBrokerageConnections, fetchBrokerageAccounts, ignoreBrokerageAccount, syncBrokerageTransactions, deleteBrokerageConnection, deleteRawData } from '../services/apiService';
import { Transaction } from '../types';

interface Props {
  onAddTransactions: (t: Transaction[]) => void;
  setLoading: (l: boolean) => void;
  initialTab?: 'manual' | 'connect';
}

const BROKERAGES = [
  { name: 'Robinhood', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { name: 'Schwab', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m4 0h1m-7 4h1m4 0h1m-7 4h1m4 0h1' },
  { name: 'Fidelity', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { name: 'Other', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' }
];

const ImportDataView: React.FC<Props> = ({ onAddTransactions, setLoading, initialTab = 'manual' }) => {
  const [activeTab, setActiveTab] = useState<'manual' | 'connect'>(initialTab);

  // Manual state
  const [selectedBroker, setSelectedBroker] = useState('');
  const [manualText, setManualText] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [showSuccessPrompt, setShowSuccessPrompt] = useState(false);

  // Connect state
  const [connectBroker, setConnectBroker] = useState('');
  const [connections, setConnections] = useState<{ id: number; brokerage: string; authorization_id: string }[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string; brokerage: string; authorization_id: string }[]>([]);
  const [connectStatus, setConnectStatus] = useState('');
  const [syncStartDate, setSyncStartDate] = useState('');
  const [syncEndDate, setSyncEndDate] = useState('');
  const [syncBrokerage, setSyncBrokerage] = useState('');
  const [syncAccountIds, setSyncAccountIds] = useState<string[]>([]);
  const [syncTickerInput, setSyncTickerInput] = useState('');
  const [syncTickers, setSyncTickers] = useState<string[]>([]);

  const loadConnections = useCallback(async () => {
    try {
      const [conns, accts] = await Promise.all([fetchBrokerageConnections(), fetchBrokerageAccounts()]);
      setConnections(conns);
      setAccounts(accts);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  // --- Manual handlers ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!selectedBroker) { setUploadError('Please select a brokerage first.'); return; }
    setUploadError('');
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      try {
        const extracted = await parseStatement(text || "", selectedBroker);
        onAddTransactions(extracted);
        setManualText('');
        setShowSuccessPrompt(true);
      } catch {
        setUploadError('Failed to parse statement.');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const handleManualImport = async () => {
    if (!selectedBroker || !manualText) return;
    setLoading(true);
    setUploadError('');
    try {
      const extracted = await parseStatement(manualText, selectedBroker);
      onAddTransactions(extracted);
      setManualText('');
      setShowSuccessPrompt(true);
    } catch {
      setUploadError('AI failed to find stock holdings in that text.');
    } finally {
      setLoading(false);
    }
  };

  // --- Connect handlers ---
  const handleConnect = async () => {
    if (!connectBroker) { setConnectStatus('Please select a brokerage first.'); return; }
    setConnectStatus('');
    setLoading(true);
    try {
      const url = await getBrokerageConnectUrl(connectBroker);
      window.open(url, '_blank');
      setConnectStatus(`A new tab has opened. Connect your ${connectBroker} account, then click "Refresh Connections" below.`);
    } catch {
      setConnectStatus('Failed to get connection URL.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshConnections = async () => {
    setLoading(true);
    try {
      await loadConnections();
      setConnectStatus('Connections refreshed.');
    } catch {
      setConnectStatus('Failed to refresh connections.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConnection = async (authorizationId: string, brokerage: string) => {
    if (!window.confirm(`Remove ${brokerage} connection?`)) return;
    setLoading(true);
    try {
      await deleteBrokerageConnection(authorizationId);
      await loadConnections();
      setConnectStatus(`${brokerage} disconnected.`);
    } catch {
      setConnectStatus('Failed to remove connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setLoading(true);
    setConnectStatus('');
    try {
      // If specific accounts selected, use those. If only a brokerage selected with no accounts,
      // use all accounts under that brokerage. Otherwise sync everything.
      let accountIds: string[] | undefined;
      if (syncAccountIds.length > 0) {
        accountIds = syncAccountIds;
      } else if (syncBrokerage) {
        accountIds = accounts.filter(a => a.authorization_id === syncBrokerage).map(a => a.id);
      }
      // Include any ticker still typed in the input field (user may not have pressed Enter)
      const effectiveTickers = [...syncTickers];
      if (syncTickerInput.trim() && !effectiveTickers.includes(syncTickerInput.trim())) {
        effectiveTickers.push(syncTickerInput.trim());
      }
      const result = await syncBrokerageTransactions(syncStartDate || undefined, syncEndDate || undefined, accountIds, effectiveTickers.length > 0 ? effectiveTickers : undefined);
      setConnectStatus(result.message);
    } catch {
      setConnectStatus('Failed to sync transactions.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-[#1D1D1F]">Import Your Portfolio</h2>
        <p className="text-[#6E6E73] text-sm">Connect your brokerage or upload a statement manually.</p>
      </div>

      {/* Tab switcher */}
      <div className="flex items-center p-1 bg-[#EFEFF4] rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('manual')}
          className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'manual' ? 'bg-white text-[#AF52DE] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Manual Upload
        </button>
        <button
          onClick={() => setActiveTab('connect')}
          className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'connect' ? 'bg-white text-[#AF52DE] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Connect Brokerage
        </button>
      </div>

      <div className="bg-white rounded-lg border border-[#D2D2D7] shadow-sm overflow-hidden">
        <div className="p-8 space-y-8">

          {/* ── Manual Tab ── */}
          {activeTab === 'manual' && (
            <>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-4">1. Select your Brokerage</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {BROKERAGES.map((broker) => (
                    <button
                      key={broker.name}
                      onClick={() => setSelectedBroker(broker.name)}
                      className={`flex flex-col items-center justify-center p-6 rounded-lg border-2 transition-all duration-200 ${
                        selectedBroker === broker.name
                          ? 'border-[#AF52DE] bg-[#F5EAFF]/20 text-[#9440C2]'
                          : 'border-[#D2D2D7] hover:border-[#D2D2D7] text-[#6E6E73]'
                      }`}
                    >
                      <svg className="w-8 h-8 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={broker.icon} />
                      </svg>
                      <span className="font-bold text-sm">{broker.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <label className="block text-sm font-bold text-slate-700">2. Upload Statement or Paste Content</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="border-2 border-dashed border-[#D2D2D7] rounded-lg p-8 flex flex-col items-center justify-center text-center space-y-4 hover:border-[#AF52DE] transition-colors bg-[#F5F5F7]">
                    <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center text-[#AF52DE]">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">Upload CSV or Text</p>
                      <p className="text-sm text-slate-500 mt-1">Export your data from your broker</p>
                    </div>
                    <input type="file" id="file-upload" className="hidden" onChange={handleFileUpload} accept=".csv,.txt" />
                    <label htmlFor="file-upload" className="px-6 py-2 bg-[#AF52DE] text-white font-bold rounded-lg cursor-pointer hover:bg-[#9440C2] transition-colors shadow-sm">
                      Select File
                    </label>
                  </div>
                  <div className="space-y-4">
                    <textarea
                      className="w-full h-44 p-4 rounded-lg border border-[#D2D2D7] focus:ring-2 focus:ring-[#AF52DE] focus:border-[#AF52DE] transition-all text-sm font-medium outline-none resize-none"
                      placeholder="Or paste your CSV/text statement here..."
                      value={manualText}
                      onChange={(e) => setManualText(e.target.value)}
                    />
                    <button
                      onClick={handleManualImport}
                      disabled={!manualText || !selectedBroker}
                      className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-800 transition-colors shadow-xl"
                    >
                      Parse Statement
                    </button>
                  </div>
                </div>
              </div>

              {uploadError && (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-lg flex items-center space-x-3 text-[#FF3B30]">
                  <span className="text-sm font-medium">{uploadError}</span>
                </div>
              )}
            </>
          )}

          {/* ── Connect Tab ── */}
          {activeTab === 'connect' && (
            <div className="space-y-8">
              {/* Connected brokerages */}
              {connections.length > 0 && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-3">Connected Brokerages</label>
                  <div className="flex flex-wrap gap-2">
                    {connections.map((item) => (
                      <span key={item.id} className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-sm font-bold">
                        ✓ {item.brokerage}
                        <button
                          onClick={() => handleDeleteConnection(item.authorization_id, item.brokerage)}
                          className="text-emerald-400 hover:text-rose-600 transition-colors ml-1"
                          title="Remove connection"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Select brokerage */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-4">1. Select Brokerage to Connect</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {BROKERAGES.map((broker) => (
                    <button
                      key={broker.name}
                      onClick={() => setConnectBroker(broker.name)}
                      className={`flex flex-col items-center justify-center p-6 rounded-lg border-2 transition-all duration-200 ${
                        connectBroker === broker.name
                          ? 'border-[#AF52DE] bg-[#F5EAFF]/20 text-[#9440C2]'
                          : 'border-[#D2D2D7] hover:border-[#D2D2D7] text-[#6E6E73]'
                      }`}
                    >
                      <svg className="w-8 h-8 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={broker.icon} />
                      </svg>
                      <span className="font-bold text-sm">{broker.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Connect button */}
              <div className="space-y-3">
                <label className="block text-sm font-bold text-slate-700">2. Connect Your Brokerage</label>
                <button
                  onClick={handleConnect}
                  disabled={!connectBroker}
                  className="w-full py-3 bg-[#AF52DE] text-white font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#9440C2] transition-colors shadow-sm"
                >
                  Connect Brokerage
                </button>
              </div>

              {/* Refresh + Sync */}
              <div className="space-y-3">
                <label className="block text-sm font-bold text-slate-700">3. After Connecting</label>

                {/* Hierarchical brokerage → account selector */}
                {connections.length > 0 && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Brokerage</label>
                      <select
                        value={syncBrokerage}
                        onChange={e => { setSyncBrokerage(e.target.value); setSyncAccountIds([]); }}
                        className="w-full px-3 py-2 rounded-lg border border-[#D2D2D7] text-sm text-[#1D1D1F] bg-white focus:outline-none focus:ring-2 focus:ring-[#AF52DE]"
                      >
                        <option value="">All Brokerages</option>
                        {connections.map(c => (
                          <option key={c.authorization_id} value={c.authorization_id}>{c.brokerage}</option>
                        ))}
                      </select>
                    </div>

                    {syncBrokerage && (() => {
                      const filteredAccounts = accounts.filter(a => a.authorization_id === syncBrokerage);
                      return filteredAccounts.length > 0 ? (
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Accounts</label>
                          <div className="flex flex-col gap-2">
                            {filteredAccounts.map(a => (
                              <div key={a.id} className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm transition-colors ${syncAccountIds.includes(a.id) ? 'bg-[#F5EAFF]/20 border-[#AF52DE]/30' : 'bg-[#F5F5F7] border-[#D2D2D7]'}`}>
                                <label className="flex items-center gap-3 flex-1 cursor-pointer min-w-0">
                                  <input
                                    type="checkbox"
                                    className="w-4 h-4 accent-[#AF52DE] shrink-0"
                                    checked={syncAccountIds.includes(a.id)}
                                    onChange={() => setSyncAccountIds(prev => prev.includes(a.id) ? prev.filter(id => id !== a.id) : [...prev, a.id])}
                                  />
                                  <p className={`font-semibold ${syncAccountIds.includes(a.id) ? 'text-[#9440C2]' : 'text-[#1D1D1F]'}`}>
                                    {a.name || 'Brokerage Account'}
                                  </p>
                                </label>
                                <button
                                  onClick={async () => {
                                    if (!window.confirm(`Hide "${a.name || 'this account'}" from WealthCompass?`)) return;
                                    await ignoreBrokerageAccount(a.id);
                                    setSyncAccountIds(prev => prev.filter(id => id !== a.id));
                                    await loadConnections();
                                  }}
                                  className="text-slate-300 hover:text-rose-500 transition-colors shrink-0"
                                  title="Hide account"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            ))}
                          </div>
                          <p className="text-xs text-slate-400">Leave all unchecked to sync all accounts for this brokerage.</p>
                        </div>
                      ) : null;
                    })()}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Start Date</label>
                    <input
                      type="date"
                      value={syncStartDate}
                      onChange={e => setSyncStartDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#AF52DE]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">End Date</label>
                    <input
                      type="date"
                      value={syncEndDate}
                      onChange={e => setSyncEndDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#AF52DE]"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Filter by Ticker (optional)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={syncTickerInput}
                      onChange={e => setSyncTickerInput(e.target.value.toUpperCase())}
                      onKeyDown={e => {
                        if ((e.key === 'Enter' || e.key === ',') && syncTickerInput.trim()) {
                          e.preventDefault();
                          const t = syncTickerInput.trim();
                          if (!syncTickers.includes(t)) setSyncTickers(prev => [...prev, t]);
                          setSyncTickerInput('');
                        }
                      }}
                      placeholder="e.g. AAPL"
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#AF52DE]"
                    />
                    <button
                      onClick={() => {
                        const t = syncTickerInput.trim();
                        if (t && !syncTickers.includes(t)) setSyncTickers(prev => [...prev, t]);
                        setSyncTickerInput('');
                      }}
                      disabled={!syncTickerInput.trim()}
                      className="px-3 py-2 bg-[#F5EAFF] text-[#9440C2] font-bold rounded-lg text-sm disabled:opacity-40 hover:bg-[#D2D2D7] transition-colors"
                    >
                      Add
                    </button>
                  </div>
                  {syncTickers.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {syncTickers.map(t => (
                        <span key={t} className="flex items-center gap-1 px-2.5 py-1 bg-[#F5EAFF]/30 text-[#9440C2] border border-[#D2D2D7] rounded text-xs font-bold">
                          {t}
                          <button onClick={() => setSyncTickers(prev => prev.filter(x => x !== t))} className="text-[#AEAEB2] hover:text-[#FF3B30] transition-colors">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </span>
                      ))}
                      <button onClick={() => setSyncTickers([])} className="text-xs text-slate-400 hover:text-rose-500 transition-colors">Clear all</button>
                    </div>
                  )}
                  <p className="text-xs text-slate-400">Leave empty to import all tickers. Press Enter or comma to add.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handleRefreshConnections}
                    className="py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors"
                  >
                    Refresh Connections
                  </button>
                  <button
                    onClick={handleSync}
                    disabled={connections.length === 0}
                    className="py-3 bg-slate-900 text-white font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-800 transition-colors shadow-xl"
                  >
                    Sync Transactions
                  </button>
                </div>
              </div>

              {connectStatus && (
                <div className={`p-4 rounded-lg border text-sm font-medium ${
                  connectStatus.includes('Synced') || connectStatus.includes('refreshed') || connectStatus.includes('tab has opened')
                    ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                    : 'bg-rose-50 border-rose-100 text-rose-700'
                }`}>
                  {connectStatus}
                </div>
              )}

              {/* Danger Zone */}
              <div className="border border-rose-100 rounded-lg p-5 space-y-3">
                <p className="text-xs font-bold text-rose-400 uppercase tracking-widest">Danger Zone</p>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    onClick={async () => {
                      if (!window.confirm('Delete all SnapTrade raw transaction data? This cannot be undone.')) return;
                      setLoading(true);
                      try {
                        const res = await deleteRawData('snaptrade');
                        setConnectStatus(res.message);
                      } catch { setConnectStatus('Failed to delete SnapTrade raw data.'); }
                      finally { setLoading(false); }
                    }}
                    className="w-full py-2.5 text-sm font-semibold text-rose-600 border border-rose-200 rounded-xl hover:bg-rose-50 transition-colors"
                  >
                    Delete SnapTrade Raw Data
                  </button>
                  <button
                    onClick={async () => {
                      if (!window.confirm('Delete all manually uploaded raw transaction data? This cannot be undone.')) return;
                      setLoading(true);
                      try {
                        const res = await deleteRawData('manual');
                        setConnectStatus(res.message);
                      } catch { setConnectStatus('Failed to delete manual raw data.'); }
                      finally { setLoading(false); }
                    }}
                    className="w-full py-2.5 text-sm font-semibold text-rose-600 border border-rose-200 rounded-xl hover:bg-rose-50 transition-colors"
                  >
                    Delete Manual Upload Raw Data
                  </button>
                  <button
                    onClick={async () => {
                      if (!window.confirm('Delete ALL raw data (SnapTrade + manual uploads) and all processed data? This is a full reset and cannot be undone.')) return;
                      setLoading(true);
                      try {
                        const res = await deleteRawData();
                        setConnectStatus(res.message);
                      } catch { setConnectStatus('Failed to delete all raw data.'); }
                      finally { setLoading(false); }
                    }}
                    className="w-full py-2.5 text-sm font-bold text-white bg-rose-500 rounded-xl hover:bg-rose-600 transition-colors"
                  >
                    Delete All Data (Full Reset)
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-[#F5F5F7] p-6 border-t border-[#D2D2D7] flex items-center justify-between text-[#6E6E73]">
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-xs font-semibold uppercase tracking-wider">End-to-End Encrypted</span>
          </div>
          <span className="text-xs italic">Statements processed locally and securely</span>
        </div>
      </div>

      {showSuccessPrompt && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-lg border border-[#D2D2D7] shadow-sm flex flex-col items-center space-y-4">
            <svg className="w-16 h-16 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-xl font-bold text-slate-900">Upload Successful!</h3>
            <p className="text-slate-600">Your statement has been successfully parsed and processed.</p>
            <button
              onClick={() => setShowSuccessPrompt(false)}
              className="px-6 py-3 bg-[#AF52DE] text-white font-bold rounded-lg hover:bg-[#9440C2] transition-colors shadow-sm"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportDataView;
