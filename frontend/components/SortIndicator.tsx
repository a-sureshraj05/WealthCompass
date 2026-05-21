import React from 'react';
import type { SortDirection } from '../utils/sort';

interface Props {
  column: string;
  sortKey: string | null;
  sortDirection: SortDirection;
}

const SortIndicator: React.FC<Props> = ({ column, sortKey, sortDirection }) => {
  if (sortKey !== column) {
    return (
      <svg className="w-3 h-3 ml-1 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    );
  }
  return (
    <span className="ml-1 text-[#0F52BA]">
      {sortDirection === 'asc' ? (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" />
        </svg>
      ) : (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
        </svg>
      )}
    </span>
  );
};

export default SortIndicator;
