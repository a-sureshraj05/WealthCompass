export type TabId = 'dashboardView' | 'holdings' | 'gainsLosses' | 'transactions' | 'importData';

export interface NavItem {
  id: TabId;
  label: string;
  /** Fits the bottom tab bar, where "Gains & Losses" would wrap. */
  shortLabel: string;
  icon: string;
}

// Shared by the desktop sidebar and the mobile tab bar so the two can't drift.
export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboardView', label: 'Dashboard', shortLabel: 'Dashboard', icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' },
  { id: 'holdings', label: 'Holdings', shortLabel: 'Holdings', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { id: 'gainsLosses', label: 'Gains & Losses', shortLabel: 'Gains', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
  { id: 'transactions', label: 'Transactions', shortLabel: 'Activity', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' },
  { id: 'importData', label: 'Import Data', shortLabel: 'Import', icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12' },
];
