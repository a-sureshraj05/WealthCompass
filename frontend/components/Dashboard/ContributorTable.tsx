import React, { useMemo, useState } from 'react';
import { sortContributorTable } from './portfolioModel';
import type { ContributorSortKey, ContributorUnit, DailyContributor } from './portfolioModel';
import { formatCurrency } from '../../utils/finance';
import { toggleSort } from '../../utils/sort';
import type { SortDirection } from '../../utils/sort';
import SortIndicator from '../SortIndicator';

export default function ContributorTable({ contributors, unit, onOpenHolding }: {
  contributors: readonly DailyContributor[];
  unit: ContributorUnit;
  onOpenHolding: (ticker: string) => void;
}) {
  const [sort, setSort] = useState<{ key: ContributorSortKey | null; direction: SortDirection }>({ key: null, direction: null });
  const rows = useMemo(() => sortContributorTable(contributors, unit, sort.key, sort.direction), [contributors, unit, sort]);
  const defaultColumn = unit === 'dollars' ? 'change' : 'percent';
  const activeColumn = sort.key || defaultColumn;
  const columns: { key: ContributorSortKey; label: string }[] = [
    { key: 'ticker', label: 'Holding' }, { key: 'change', label: 'Dollar change' }, { key: 'percent', label: 'Daily move' },
  ];
  const description = sort.key
    ? `Sorted by ${columns.find(column => column.key === sort.key)!.label.toLowerCase()}, ${sort.direction === 'asc' ? 'ascending' : 'descending'}.`
    : `Ranked by largest absolute ${unit === 'dollars' ? 'dollar change' : 'percentage move'}.`;
  return <div className="contributors-all" role="region" aria-label="All daily contributors" tabIndex={0}>
    <table>
      <caption className="sr-only">All contributors. {description} Column headers cycle through ascending, descending and default ranking. Percentage moves are each holding’s daily return.</caption>
      <thead><tr><th scope="col">#</th>{columns.map(column => {
        const next = toggleSort(column.key, sort.key, sort.direction);
        const action = !next.key ? 'Restore default ranking' : `Sort ${column.label.toLowerCase()} ${next.direction === 'asc' ? 'ascending' : 'descending'}`;
        return <th key={column.key} scope="col" className={activeColumn === column.key ? 'is-active' : ''} aria-sort={sort.key === column.key ? sort.direction === 'asc' ? 'ascending' : 'descending' : !sort.key && defaultColumn === column.key ? 'other' : 'none'}>
          <button type="button" aria-label={action} title={action} onClick={() => setSort(current => toggleSort(column.key, current.key, current.direction))}>
            {column.label}<span aria-hidden="true"><SortIndicator column={column.key} sortKey={sort.key} sortDirection={sort.direction} /></span>
          </button>
        </th>;
      })}</tr></thead>
      <tbody>{rows.map((contributor, index) => <tr key={contributor.ticker}>
        <td>{index + 1}</td>
        <th scope="row" className={activeColumn === 'ticker' ? 'is-active' : undefined}><button type="button" onClick={() => onOpenHolding(contributor.ticker)} aria-label={`View ${contributor.ticker} holding`}>{contributor.ticker}<span aria-hidden="true">→</span></button></th>
        <td className={`${activeColumn === 'change' ? 'is-active ' : ''}${contributor.change >= 0 ? 'positive' : 'negative'}`}>{contributor.change > 0 ? '+' : contributor.change < 0 ? '−' : ''}{formatCurrency(Math.abs(contributor.change))}</td>
        <td className={`${activeColumn === 'percent' ? 'is-active ' : ''}${contributor.percent >= 0 ? 'positive' : 'negative'}`}>{contributor.percent > 0 ? '+' : ''}{contributor.percent.toFixed(2)}%</td>
      </tr>)}</tbody>
    </table>
  </div>;
}
