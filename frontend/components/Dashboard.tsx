


import React from 'react';

import { StockHolding, PortfolioStats, Transaction } from '../types';

import SummaryCards from './SummaryCards';

import PortfolioVisuals from './PortfolioVisuals';

import HoldingsTable from './HoldingsTable';

import ImportPanel from './ImportPanel';

import AIInsights from './AIInsights';

import TransactionsTable from './TransactionsTable'; // Import TransactionsTable



interface Props {

  activeTab: string;

  holdings: StockHolding[];

  transactions: Transaction[]; // Add transactions to props

  stats: PortfolioStats;

  onAddHoldings: (h: StockHolding[]) => void;

  onAddTransactions: (t: Transaction[]) => void; // New prop for transactions

  onRemoveHolding: (id: string) => void;

  onRemoveTransaction: (id: string) => void; // Add onRemoveTransaction to props

  onClearAll: () => void;

  setLoading: (l: boolean) => void;

  loading: boolean;

}



const Dashboard: React.FC<Props> = ({

  activeTab,

  holdings,

  transactions,

  stats,

  onAddHoldings,

  onAddTransactions,

  onRemoveHolding,

  onRemoveTransaction,

  onClearAll,

  setLoading,

  loading

}) => {

  if (activeTab === 'import') {

    return <ImportPanel onAddHoldings={onAddHoldings} onAddTransactions={onAddTransactions} setLoading={setLoading} />;

  }



  if (activeTab === 'holdings') {

    return (

      <div className="space-y-6">

        <div className="flex items-center justify-between">

          <h2 className="text-2xl font-bold text-slate-900">Portfolio Holdings</h2>

          <button

            onClick={onClearAll}

            className="px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-rose-200"

          >

            Clear All Data

          </button>

        </div>

        <HoldingsTable holdings={holdings} onRemove={onRemoveHolding} />

      </div>

    );

  }



  if (activeTab === 'transactions') {

    return (

      <div className="space-y-6">

        <div className="flex items-center justify-between">

          <h2 className="text-2xl font-bold text-slate-900">Transaction History</h2>

          <button

            onClick={onClearAll}

            className="px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-rose-200"

          >

            Clear All Data

          </button>

        </div>

        <TransactionsTable transactions={transactions} onRemove={onRemoveTransaction} />

      </div>

    );

  }



  return (

    <div className="space-y-6">

      <SummaryCards stats={stats} />



      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <div className="lg:col-span-2 space-y-6">

          <PortfolioVisuals holdings={holdings} />

          <div className="bg-white p-6 rounded-2xl border shadow-sm">

            <h3 className="text-lg font-bold text-slate-900 mb-4">Recent Performance</h3>

            <HoldingsTable holdings={holdings.slice(0, 5)} onRemove={onRemoveHolding} />

            {holdings.length > 5 && (

              <p className="mt-4 text-center text-sm text-indigo-600 font-medium cursor-pointer">

                View all holdings →

              </p>

            )}

          </div>

        </div>



        <div className="space-y-6">

          <AIInsights holdings={holdings} />



          <div className="bg-gradient-to-br from-slate-900 to-indigo-900 p-6 rounded-2xl text-white shadow-xl">

            <h3 className="text-lg font-bold mb-2">Connect More</h3>

            <p className="text-slate-300 text-sm mb-6 leading-relaxed">

              Consolidate your Robinhood, Schwab, and Fidelity accounts for a 360° view of your net worth.

            </p>

            <button

              className="w-full py-3 bg-white text-indigo-900 font-bold rounded-xl shadow-lg hover:bg-indigo-50 transition-colors"

              onClick={() => {}}

            >

              Get Started

            </button>

          </div>

        </div>

      </div>

    </div>

  );

};



export default Dashboard;


