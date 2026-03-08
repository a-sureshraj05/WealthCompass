import React from 'react';

interface Props {
  activeTab: string;
  setActiveTab: (tab: 'dashboardView' | 'holdings' | 'importData' | 'transactions' | 'gainsLosses') => void;
}

const Sidebar: React.FC<Props> = ({ activeTab, setActiveTab }) => {
  const menuItems = [
    { id: 'dashboardView', label: 'Dashboard', icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' },
    { id: 'holdings', label: 'Holdings', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { id: 'gainsLosses', label: 'Gains & Losses', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
    { id: 'transactions', label: 'Transactions', icon: 'M3 10v6m0 0v-6m0 6h18m0-6v6m0-6h-18m0 6a2 2 0 002 2h14a2 2 0 002-2v-6H3zM4 10h16a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2a1 1 0 011-1z' },
    { id: 'importData', label: 'Import Data', icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12' }
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 hidden lg:flex">
      <div className="p-6 flex items-center space-x-3 text-white">
        <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        </div>
        <span className="text-xl font-bold tracking-tight">WealthCompass</span>
      </div>

      <nav className="flex-1 mt-6 px-4 space-y-1">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={async () => {
              setActiveTab(item.id as any);
            }}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${
              activeTab === item.id 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
                : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
            </svg>
            <span className="font-medium">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-6">
        <div className="bg-slate-800 rounded-2xl p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Security Note</p>
          <p className="text-xs text-slate-500 leading-relaxed">
            All data is processed locally. No personal data is stored on our servers.
          </p>
          <div className="mt-3 flex items-center space-x-2 text-indigo-400">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M2.166 4.9L10 .303l7.834 4.597V13.7l-7.834 4.597-7.834-4.597V4.9zM10 2.227l-6.166 3.619v7.108L10 16.573l6.166-3.619V5.846L10 2.227z" clipRule="evenodd" />
            </svg>
            <span className="text-xs font-medium">Bank-grade Security</span>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
