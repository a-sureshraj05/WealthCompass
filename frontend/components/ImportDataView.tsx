import React, { useState, useEffect, useCallback } from 'react';
import { parseStatement, getBrokerageConnectUrl, fetchBrokerageConnections, syncBrokerageTransactions, deleteBrokerageConnection } from '../services/apiService';
import { Transaction } from '../types';

interface Props {
  onAddTransactions: (t: Transaction[]) => void;
  setLoading: (l: boolean) => void;
}

const BROKERAGES = [
  { name: 'Robinhood', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { name: 'Schwab', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m4 0h1m-7 4h1m4 0h1m-7 4h1m4 0h1' },
  { name: 'Fidelity', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { name: 'Other', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' }
];

const ImportDataView: React.FC<Props> = ({ onAddTransactions, setLoading }) => {
  const [activeTab, setActiveTab] = useState<'manual' | 'connect'>('manual');

  // Manual state
  const [selectedBroker, setSelectedBroker] = useState('');
  const [manualText, setManualText] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [showSuccessPrompt, setShowSuccessPrompt] = useState(false);

  // Connect state
  const [connectBroker, setConnectBroker] = useState('');
  const [connections, setConnections] = useState<{ id: number; brokerage: string; authorization_id: string }[]>([]);
  const [connectStatus, setConnectStatus] = useState('');

  const loadConnections = useCallback(async () => {
    try {
      setConnections(await fetchBrokerageConnections());
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
      const result = await syncBrokerageTransactions();
      setConnectStatus(result.message);
    } catch {
      setConnectStatus('Failed to sync transactions.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-extrabold text-slate-900">Import Your Portfolio</h2>
        <p className="text-slate-500">Connect your brokerage or upload a statement manually.</p>
      </div>

      {/* Tab switcher */}
      <div className="flex items-center p-1 bg-slate-100 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab('manual')}
          className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'manual' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Manual Upload
        </button>
        <button
          onClick={() => setActiveTab('connect')}
          className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'connect' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Connect Brokerage
        </button>
      </div>

      <div className="bg-white rounded-3xl border shadow-xl overflow-hidden">
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
                      className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all duration-200 ${
                        selectedBroker === broker.name
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                          : 'border-slate-100 hover:border-slate-200 text-slate-500'
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
                  <div className="border-2 border-dashed border-slate-200 rounded-3xl p-8 flex flex-col items-center justify-center text-center space-y-4 hover:border-indigo-400 transition-colors bg-slate-50/50">
                    <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center text-indigo-600">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">Upload CSV or Text</p>
                      <p className="text-sm text-slate-500 mt-1">Export your data from your broker</p>
                    </div>
                    <input type="file" id="file-upload" className="hidden" onChange={handleFileUpload} accept=".csv,.txt" />
                    <label htmlFor="file-upload" className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-xl cursor-pointer hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200">
                      Select File
                    </label>
                  </div>
                  <div className="space-y-4">
                    <textarea
                      className="w-full h-44 p-4 rounded-3xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-sm font-medium outline-none resize-none"
                      placeholder="Or paste your CSV/text statement here..."
                      value={manualText}
                      onChange={(e) => setManualText(e.target.value)}
                    />
                    <button
                      onClick={handleManualImport}
                      disabled={!manualText || !selectedBroker}
                      className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-800 transition-colors shadow-xl"
                    >
                      Parse with Gemini AI
                    </button>
                  </div>
                </div>
              </div>

              {uploadError && (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center space-x-3 text-rose-700">
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
                      className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all duration-200 ${
                        connectBroker === broker.name
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                          : 'border-slate-100 hover:border-slate-200 text-slate-500'
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
                  className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700 transition-colors shadow-lg"
                >
                  Connect Brokerage
                </button>
              </div>

              {/* Refresh + Sync */}
              <div className="space-y-3">
                <label className="block text-sm font-bold text-slate-700">3. After Connecting</label>
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
                <div className={`p-4 rounded-2xl border text-sm font-medium ${
                  connectStatus.includes('Synced') || connectStatus.includes('refreshed') || connectStatus.includes('tab has opened')
                    ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                    : 'bg-rose-50 border-rose-100 text-rose-700'
                }`}>
                  {connectStatus}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-slate-50 p-6 border-t flex items-center justify-between text-slate-500">
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-xs font-semibold uppercase tracking-wider">End-to-End Encrypted</span>
          </div>
          <span className="text-xs italic">Parsing powered by Google Gemini Flash</span>
        </div>
      </div>

      {showSuccessPrompt && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center space-y-4">
            <svg className="w-16 h-16 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-xl font-bold text-slate-900">Upload Successful!</h3>
            <p className="text-slate-600">Your statement has been successfully parsed and processed.</p>
            <button
              onClick={() => setShowSuccessPrompt(false)}
              className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-lg"
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
