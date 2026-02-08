
import React from 'react';

import { Transaction } from '../types';



interface Props {

  transactions: Transaction[];

  onRemove: (id: string) => void;

}



const TransactionsTable: React.FC<Props> = ({ transactions, onRemove }) => {

  const sortedTransactions = [...transactions].sort((a, b) => 

    new Date(b.date).getTime() - new Date(a.date).getTime()

  );



  if (transactions.length === 0) {

    return (

      <div className="py-12 text-center text-slate-400 border-2 border-dashed rounded-xl border-slate-200">

        No transaction history found. Import your statements to populate this list.

      </div>

    );

  }



  return (

    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">

      <table className="w-full text-left">

        <thead>

          <tr className="bg-slate-50 border-b border-slate-200">

            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>

            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Asset</th>

            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Values in $</th>

            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Quantity</th>

            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Price</th>

            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Total Amount ($)</th>

            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Brokerage</th>

            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider"></th>

          </tr>

        </thead>

        <tbody className="divide-y divide-slate-200">

          {sortedTransactions.map((t) => (

            <tr key={t.id} className="hover:bg-slate-50 transition-colors">

              <td className="px-6 py-4 text-sm text-slate-600 font-medium whitespace-nowrap">

                {new Date(t.date).toLocaleDateString()}

              </td>

              <td className="px-6 py-4">

                <div className="flex items-center space-x-2">

                  <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center font-bold text-slate-700 text-xs">

                    {t.ticker}

                  </div>

                  <span className="font-bold text-slate-900">{t.ticker}</span>

                </div>

              </td>

              <td className="px-6 py-4">

                <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${

                  t.type === 'BUY' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'

                }`}>

                  {t.type}

                </span>

              </td>

              <td className="px-6 py-4 text-sm text-slate-700">{t.quantity}</td>

              <td className="px-6 py-4 text-sm text-slate-700">{t.price.toFixed(2)}</td>

              <td className="px-6 py-4 font-bold text-slate-900">

                {t.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}

              </td>

              <td className="px-6 py-4">

                <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${

                  t.brokerage === 'Robinhood' ? 'bg-emerald-50 text-emerald-600' : 

                  t.brokerage === 'Schwab' ? 'bg-indigo-50 text-indigo-600' : 

                  'bg-slate-100 text-slate-600'

                }`}>

                  {t.brokerage}

                </span>

              </td>

              <td className="px-6 py-4 text-right">

                <button 

                  onClick={() => onRemove(t.id)}

                  className="p-1 text-slate-300 hover:text-rose-600 transition-colors"

                >

                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">

                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />

                  </svg>

                </button>

              </td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>

  );

};



export default TransactionsTable;


