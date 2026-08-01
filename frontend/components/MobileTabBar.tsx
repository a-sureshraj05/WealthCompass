import React from 'react';
import { NAV_ITEMS, TabId } from './navItems';

interface Props {
  activeTab: string;
  setActiveTab: (tab: TabId) => void;
}

/**
 * Bottom navigation for phones and small tablets. The sidebar is `hidden lg:flex`,
 * so without this there is no way to change tabs below 1024px.
 *
 * Rows are 44px+ to meet the iOS touch-target guideline, and the bar pads itself
 * past the home indicator via safe-area insets (index.html sets viewport-fit=cover).
 */
const MobileTabBar: React.FC<Props> = ({ activeTab, setActiveTab }) => (
  <nav
    className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-[#D2D2D7] flex"
    style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    aria-label="Primary"
  >
    {NAV_ITEMS.map(item => {
      const active = activeTab === item.id;
      return (
        <button
          key={item.id}
          onClick={() => setActiveTab(item.id)}
          aria-current={active ? 'page' : undefined}
          className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] transition-colors ${
            active ? 'text-[#0F52BA]' : 'text-slate-400 active:text-slate-600'
          }`}
        >
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
          </svg>
          <span className={`text-[10px] leading-none ${active ? 'font-bold' : 'font-medium'}`}>
            {item.shortLabel}
          </span>
        </button>
      );
    })}
  </nav>
);

export default MobileTabBar;
