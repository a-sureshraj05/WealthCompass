import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { BrokerageAccount, Transaction } from '../types';
import TickerLogo from './TickerLogo';
import { AssetTypeValue, ActionValue } from './Transactions/TransactionLabels';
import { assetTypeLabel } from './Transactions/labelPresentation';
import SortIndicator from './SortIndicator';
import { useTableColumns } from '../hooks/useTableColumns';
import ColumnOrderSheet from './ColumnOrderSheet';
import { FilterToolbar, MultiSelectFilter, SelectFilter, ColumnsButton, selectionChips } from './TableFilters';
import BrokerageValue, { BrokerageRoute } from './BrokerageValue';
import {
  fetchOpenBuys, fetchLotAssignments, createLotAssignment, deleteLotAssignment, splitTransaction,
  OpenBuyLot, LotAssignment,
} from '../services/apiService';

type DateRangeType = 'all' | '30d' | '90d' | 'ytd' | 'custom';
type SortKey = 'date' | 'brokerage' | 'assetType' | 'ticker' | 'action' | 'quantity' | 'price' | 'amount';
type SortDirection = 'asc' | 'desc' | null;
type ColKey = 'date' | 'brokerage' | 'assetType' | 'ticker' | 'action' | 'quantity' | 'price' | 'amount';
const DEFAULT_COLS: ColKey[] = ['date', 'ticker', 'action', 'brokerage', 'assetType', 'quantity', 'price', 'amount'];

const RECOMMENDED_COLS: readonly ColKey[] = DEFAULT_COLS;
const REQUIRED_COLS: readonly ColKey[] = ['date','ticker'];
const COLUMN_PRESETS: Record<string, readonly ColKey[]> = { Ledger: RECOMMENDED_COLS, Compact: ['date','ticker','action','quantity','amount'] };
const COL_LABELS: Record<ColKey, string> = {
  date: 'Date', brokerage: 'Brokerage', assetType: 'Asset Type', ticker: 'Ticker',
  action: 'Action', quantity: 'Quantity', price: 'Price', amount: 'Amount',
};

type VisibilityFilter = 'active' | 'hidden' | 'duplicates' | 'all';

interface Props {
  transactions: Transaction[];
  onRemove: (id: string) => void;
  onSoftDelete: (id: string, isDeleted: boolean) => void;
  onUpdate: (id: string, updates: Partial<Transaction>) => void;
  onRevert: (id: string) => void;
  selectedBrokerages: string[];
  setSelectedBrokerages: (v: string[]) => void;
  selectedAssetTypes: string[];
  setSelectedAssetTypes: (v: string[]) => void;
  selectedTickers: string[];
  setSelectedTickers: (v: string[]) => void;
  focusTicker?: string | null;
  focusDate?: string | null;
  onClearFocus?: () => void;
  allKnownBrokerages?: string[];
  accounts?: BrokerageAccount[];
  numbersVisible?: boolean;
}

const TransactionsView: React.FC<Props> = ({ transactions, onRemove, onSoftDelete, onUpdate, onRevert, selectedBrokerages, setSelectedBrokerages, selectedAssetTypes, setSelectedAssetTypes, selectedTickers, setSelectedTickers, focusTicker, focusDate, onClearFocus, allKnownBrokerages, accounts = [], numbersVisible = true }) => {
  const accountMap = useMemo(() => Object.fromEntries(accounts.map(a => [a.id, a.name])) as Record<number, string>, [accounts]);
  const [dateRangeType, setDateRangeType] = useState<DateRangeType>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  
  // Sorting state
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('active');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Transaction>>({});

  // Track which sell transaction IDs have at least one lot assignment (for icon highlight)
  const [mappedSellIds, setMappedSellIds] = useState<Set<string>>(new Set());

  // Server-backed so the order matches on the Mac and the phone.
  const { order: allColumns, visible: visibleColumns, columns: columnOrder, reorder: reorderCol, move: moveCol, toggle: toggleColumn, reset: resetColumns, preset: applyColumnPreset } =
    useTableColumns<ColKey>('transactions-col-order', DEFAULT_COLS, RECOMMENDED_COLS, REQUIRED_COLS);
  useEffect(() => {
    if (sortKey && !visibleColumns.includes(sortKey)) { setSortKey(null); setSortDirection(null); }
  }, [visibleColumns, sortKey]);
  const [showColSheet, setShowColSheet] = useState(false);
  const [dragCol, setDragCol] = useState<ColKey | null>(null);
  const [dragOverCol, setDragOverCol] = useState<ColKey | null>(null);

  useEffect(() => {
    fetchLotAssignments('').then(all => {
      setMappedSellIds(new Set(all.map(a => String(a.sell_transaction_id))));
    }).catch(() => {});
  }, []);

  // Split modal state
  const [splitTxn, setSplitTxn] = useState<Transaction | null>(null);
  const [splitQty, setSplitQty] = useState<string>('');
  const [splitError, setSplitError] = useState<string | null>(null);
  const [splitLoading, setSplitLoading] = useState(false);

  const openSplitModal = (t: Transaction) => { setSplitTxn(t); setSplitQty(''); setSplitError(null); };
  const closeSplitModal = () => { setSplitTxn(null); setSplitQty(''); setSplitError(null); };

  const confirmSplit = async () => {
    if (!splitTxn) return;
    const qty = parseFloat(splitQty);
    if (!qty || qty <= 0 || qty >= splitTxn.quantity) {
      setSplitError(`Enter a quantity between 0 and ${splitTxn.quantity}`);
      return;
    }
    setSplitLoading(true);
    setSplitError(null);
    try {
      await splitTransaction(splitTxn.id, qty);
      closeSplitModal();
      window.location.reload();
    } catch (e: any) {
      setSplitError(e.message);
    } finally {
      setSplitLoading(false);
    }
  };

  // Lot assignment modal state
  const [lotModalSellId, setLotModalSellId] = useState<string | null>(null);
  const [lotModalSellTxn, setLotModalSellTxn] = useState<Transaction | null>(null);
  const [openBuys, setOpenBuys] = useState<OpenBuyLot[]>([]);
  const [existingAssignments, setExistingAssignments] = useState<LotAssignment[]>([]);
  const [assignQtys, setAssignQtys] = useState<Record<number, string>>({});
  const [lotModalLoading, setLotModalLoading] = useState(false);
  const [lotModalError, setLotModalError] = useState<string | null>(null);

  const openLotModal = useCallback(async (t: Transaction) => {
    setLotModalSellId(t.id);
    setLotModalSellTxn(t);
    setLotModalLoading(true);
    setLotModalError(null);
    setAssignQtys({});
    try {
      const [buys, assignments] = await Promise.all([
        fetchOpenBuys(t.id),
        fetchLotAssignments(t.id),  // filtered by sell ID
      ]);
      setOpenBuys(buys);
      setExistingAssignments(assignments);
    } catch (e: any) {
      setLotModalError(e.message);
    } finally {
      setLotModalLoading(false);
    }
  }, []);

  const closeLotModal = () => {
    setLotModalSellId(null);
    setLotModalSellTxn(null);
    setOpenBuys([]);
    setExistingAssignments([]);
    setAssignQtys({});
    setLotModalError(null);
  };

  const saveAssignments = async () => {
    if (!lotModalSellId) return;
    setLotModalLoading(true);
    setLotModalError(null);
    try {
      for (const [buyIdStr, qtyStr] of Object.entries(assignQtys)) {
        const qty = parseFloat(qtyStr);
        if (!qty || qty <= 0) continue;
        await createLotAssignment(lotModalSellId, parseInt(buyIdStr), qty);
      }
      // Refresh modal + global highlight map
      const [buys, assignments, allAssignments] = await Promise.all([
        fetchOpenBuys(lotModalSellId),
        fetchLotAssignments(lotModalSellId),
        fetchLotAssignments(),
      ]);
      setOpenBuys(buys);
      setExistingAssignments(assignments);
      setMappedSellIds(new Set(allAssignments.map(a => String(a.sell_transaction_id))));
      setAssignQtys({});
    } catch (e: any) {
      setLotModalError(e.message);
    } finally {
      setLotModalLoading(false);
    }
  };

  const removeAssignment = async (assignmentId: number) => {
    if (!lotModalSellId) return;
    setLotModalLoading(true);
    try {
      await deleteLotAssignment(assignmentId);
      const [buys, assignments, allAssignments] = await Promise.all([
        fetchOpenBuys(lotModalSellId),
        fetchLotAssignments(lotModalSellId),
        fetchLotAssignments(),
      ]);
      setOpenBuys(buys);
      setExistingAssignments(assignments);
      setMappedSellIds(new Set(allAssignments.map(a => String(a.sell_transaction_id))));
    } catch (e: any) {
      setLotModalError(e.message);
    } finally {
      setLotModalLoading(false);
    }
  };

  


  const [transferPopoverId, setTransferPopoverId] = useState<string | null>(null);
  const [transferPopoverFlip, setTransferPopoverFlip] = useState(false);
  const transferPopoverRef = useRef<HTMLDivElement>(null);

  const openTransferPopover = (id: string, btn: HTMLElement) => {
    const rect = btn.getBoundingClientRect();
    setTransferPopoverFlip(window.innerHeight - rect.bottom < 220);
    setTransferPopoverId(id);
  };

  useEffect(() => {
    if (!transferPopoverId) return;
    const handler = (e: MouseEvent) => {
      if (transferPopoverRef.current && !transferPopoverRef.current.contains(e.target as Node)) {
        setTransferPopoverId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [transferPopoverId]);

  const formatAssetType = (type: string) => assetTypeLabel(type).label;

  const allBrokerages = useMemo(() => {
    const brokers = new Set(transactions.map(t => t.brokerage));
    return Array.from(brokers).sort();
  }, [transactions]);

  const allAssetTypes = useMemo(() => {
    const assetTypes = new Set(
      transactions
        .map(t => t.assetType && t.assetType.toUpperCase())
        .filter(Boolean) as string[]
    );
    return Array.from(assetTypes).sort();
  }, [transactions]);

  const allTickers = useMemo(() => {
    const tickers = new Set(transactions.map(t => t.ticker));
    return Array.from(tickers).sort();
  }, [transactions]);




  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDirection === 'asc') setSortDirection('desc');
      else if (sortDirection === 'desc') {
        setSortKey(null);
        setSortDirection(null);
      }
      else setSortDirection('asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const filteredTransactions = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    const ninetyDaysAgo = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    let result = transactions.filter((t) => {
      const matchesVisibility =
        visibilityFilter === 'all' ||
        (visibilityFilter === 'active' && !t.is_deleted && !t.is_duplicate) ||
        (visibilityFilter === 'hidden' && t.is_deleted) ||
        (visibilityFilter === 'duplicates' && t.is_duplicate);
      const matchesBrokerage = selectedBrokerages.length === 0 || selectedBrokerages.map(b => b.toLowerCase().trim()).includes((t.brokerage || '').toLowerCase().trim());
      const matchesAssetType = selectedAssetTypes.length === 0 || selectedAssetTypes.map(at => at.toLowerCase()).includes((t.assetType || '').toLowerCase());
      const matchesTicker = focusTicker
        ? t.ticker === focusTicker
        : selectedTickers.length === 0 || selectedTickers.includes(t.ticker);
      const matchesFocusDate = !focusDate || t.date.substring(0, 10) === focusDate.substring(0, 10);

      const transactionDate = new Date(t.date).getTime();

      let matchesDate = true;
      if (dateRangeType === '30d') matchesDate = transactionDate >= thirtyDaysAgo.getTime();
      else if (dateRangeType === '90d') matchesDate = transactionDate >= ninetyDaysAgo.getTime();
      else if (dateRangeType === 'ytd') matchesDate = transactionDate >= startOfYear.getTime();
      else if (dateRangeType === 'custom') {
        const matchesStart = !startDate || transactionDate >= new Date(startDate).getTime();
        const matchesEnd = !endDate || transactionDate <= new Date(endDate).getTime();
        matchesDate = matchesStart && matchesEnd;
      }

      return matchesVisibility && matchesBrokerage && matchesAssetType && matchesTicker && matchesDate && matchesFocusDate;
    });

    // Apply Sorting
    if (sortKey && sortDirection) {
      result = [...result].sort((a, b) => {
        let valA: any;
        let valB: any;

        switch (sortKey) {
          case 'date':
            valA = new Date(a.date).getTime();
            valB = new Date(b.date).getTime();
            if (valA === valB) return sortDirection === 'asc' ? parseInt(a.id) - parseInt(b.id) : parseInt(b.id) - parseInt(a.id);
            break;
          case 'brokerage':
            valA = a.brokerage.toLowerCase();
            valB = b.brokerage.toLowerCase();
            break;
          case 'assetType':
            valA = (a.assetType || '').toLowerCase();
            valB = (b.assetType || '').toLowerCase();
            break;
          case 'ticker':
            valA = a.ticker.toLowerCase();
            valB = b.ticker.toLowerCase();
            break;
          case 'action':
            valA = a.action.toLowerCase();
            valB = b.action.toLowerCase();
            break;
          case 'quantity':
            valA = a.quantity;
            valB = b.quantity;
            break;
          case 'price':
            valA = a.price;
            valB = b.price;
            break;
          case 'amount':
            valA = a.totalCost || (a.quantity * a.price);
            valB = b.totalCost || (b.quantity * b.price);
            break;
          default:
            return 0;
        }

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      // Default Sort: Descending Date, then descending ID for same-date stability
      result = [...result].sort((a, b) => {
        const diff = new Date(b.date).getTime() - new Date(a.date).getTime();
        return diff !== 0 ? diff : parseInt(b.id) - parseInt(a.id);
      });
    }

    return result;
  }, [transactions, visibilityFilter, selectedBrokerages, selectedAssetTypes, selectedTickers, focusTicker, focusDate, dateRangeType, startDate, endDate, sortKey, sortDirection]);

  const resetFilters = () => {
    setSelectedBrokerages([]);
    setSelectedAssetTypes([]);
    setSelectedTickers([]);
    setDateRangeType('all');
    setStartDate('');
    setEndDate('');
    setSortKey(null);
    setSortDirection(null);
    setVisibilityFilter('active');
  };

  const SI = ({ column }: { column: SortKey }) => (
    <SortIndicator column={column} sortKey={sortKey} sortDirection={sortDirection} />
  );

  const dragProps = (col: ColKey) => ({
    draggable: true as const,
    onDragStart: (e: React.DragEvent) => { e.dataTransfer.effectAllowed = 'move'; setDragCol(col); },
    onDragOver:  (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverCol(col); },
    onDrop:      (e: React.DragEvent) => { e.preventDefault(); if (dragCol) reorderCol(dragCol, col); setDragCol(null); setDragOverCol(null); },
    onDragEnd:   () => { setDragCol(null); setDragOverCol(null); },
  });

  const thCls = (col: ColKey, extra = '') =>
    `px-6 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap select-none cursor-grab active:cursor-grabbing transition-colors
     ${dragOverCol === col ? 'border-l-2 border-[#2458d3] bg-[#edf3fc]/40' : ''}
     ${dragCol === col ? 'opacity-40' : ''}
     ${extra}`.replace(/\s+/g, ' ').trim();

  const renderTh = (col: ColKey) => {
    const dp = dragProps(col);
    const sortable = (label: string, sk: SortKey, right = false) => (
      <th key={col} {...dp} className={thCls(col, `hover:text-[#2458d3]${right ? ' text-right' : ''}`)} onClick={() => handleSort(sk)}>
        <div className={`flex items-center gap-1${right ? ' justify-end' : ''}`}>{label}<SI column={sk} /></div>
      </th>
    );
    switch (col) {
      case 'date':      return sortable('Date', 'date');
      case 'brokerage': return sortable('Brokerage', 'brokerage');
      case 'assetType': return sortable('Asset Type', 'assetType');
      case 'ticker':    return sortable('Ticker', 'ticker');
      case 'action':    return sortable('Action', 'action');
      case 'quantity':  return sortable('Quantity', 'quantity', true);
      case 'price':     return sortable('Price', 'price', true);
      case 'amount':    return sortable('Amount ($)', 'amount', true);
      default: return <th key={col} />;
    }
  };

  const inputCls = "w-full px-2 py-1 text-xs border border-[#2458d3] rounded bg-white focus:outline-none focus:ring-2 focus:ring-[#2458d3]";

  const renderCell = (col: ColKey, t: Transaction, isEditing: boolean) => {
    switch (col) {
      case 'date': return (
        <td key={col} className="px-6 py-2 whitespace-nowrap">
          {isEditing
            ? <input type="date" className={inputCls} value={editDraft.date as string || ''} onChange={e => setEditDraft(d => ({ ...d, date: e.target.value }))} />
            : <span className="text-sm text-slate-500 font-medium">{new Date(t.date).toLocaleDateString('en-CA')}</span>}
        </td>
      );
      case 'brokerage': return (
        <td key={col} className="px-6 py-2">
          {isEditing ? (
            <div className="flex flex-col gap-1">
              <input className={inputCls} value={editDraft.brokerage || ''} onChange={e => setEditDraft(d => ({ ...d, brokerage: e.target.value }))} />
              {accounts.filter(a => a.brokerage === (editDraft.brokerage || t.brokerage)).length > 0 && (
                <select className={inputCls} value={editDraft.account_id ?? t.account_id ?? ''} onChange={e => setEditDraft(d => ({ ...d, account_id: e.target.value ? parseInt(e.target.value) : null }))}>
                  <option value="">— No account —</option>
                  {accounts.filter(a => a.brokerage === (editDraft.brokerage || t.brokerage)).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}
            </div>
          ) : (
            <BrokerageRoute from={t.brokerage} to={t.current_brokerage}
              accountName={t.account_id != null ? accountMap[t.account_id] : undefined} />
          )}
        </td>
      );
      case 'assetType': return (
        <td key={col} className="px-6 py-2">
          {isEditing
            ? <input className={inputCls} value={editDraft.assetType || ''} onChange={e => setEditDraft(d => ({ ...d, assetType: e.target.value }))} />
            : <AssetTypeValue value={t.assetType} />}
        </td>
      );
      case 'ticker': return (
        <td key={col} className="px-6 py-2">
          {isEditing
            ? <input className={inputCls} value={editDraft.ticker || ''} onChange={e => setEditDraft(d => ({ ...d, ticker: e.target.value.toUpperCase() }))} />
            : <div className="flex items-center gap-1.5"><TickerLogo ticker={t.ticker} size={24} assetType={t.assetType} /><span className="text-[11px] font-bold text-[#192b46] uppercase tracking-tight">{t.ticker}</span></div>}
        </td>
      );
      case 'action': return (
        <td key={col} className="px-6 py-2">
          {isEditing
            ? <input className={inputCls} value={editDraft.action || ''} onChange={e => setEditDraft(d => ({ ...d, action: e.target.value.toUpperCase() }))} />
            : <ActionValue value={t.action} />}
        </td>
      );
      case 'quantity': return (
        <td key={col} className="px-6 py-2 text-right whitespace-nowrap">
          {isEditing
            ? <input type="number" className={inputCls + ' text-right'} value={editDraft.quantity ?? ''} onChange={e => setEditDraft(d => ({ ...d, quantity: parseFloat(e.target.value) }))} />
            : <span className="text-sm text-slate-700 font-bold">{t.quantity}</span>}
        </td>
      );
      case 'price': return (
        <td key={col} className="px-6 py-2 text-right whitespace-nowrap">
          {isEditing
            ? <input type="number" className={inputCls + ' text-right'} value={editDraft.price ?? ''} onChange={e => setEditDraft(d => ({ ...d, price: parseFloat(e.target.value) }))} />
            : <span className="text-sm text-slate-500 font-medium">${(t.price ?? 0).toFixed(2)}</span>}
        </td>
      );
      case 'amount': return (
        <td key={col} className="px-6 py-2 text-right whitespace-nowrap">
          <div className="text-sm font-black text-slate-900">
            ${(() => {
              const amount = isEditing
                ? ((editDraft.quantity ?? t.quantity) * (editDraft.price ?? t.price ?? 0)) || t.totalCost || 0
                : t.totalCost || (t.quantity * (t.price ?? 0));
              return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            })()}
          </div>
        </td>
      );
      default: return <td key={col} />;
    }
  };

  return (
    <div className="space-y-4">
      <FilterToolbar resultLabel={`${filteredTransactions.length} ${filteredTransactions.length === 1 ? 'transaction' : 'transactions'}`} onClear={() => { resetFilters(); onClearFocus?.(); }}
        chips={[
          ...selectionChips('Brokerage', selectedBrokerages, setSelectedBrokerages),
          ...selectionChips('Asset type', selectedAssetTypes, setSelectedAssetTypes, formatAssetType),
          ...selectionChips('Ticker', selectedTickers, setSelectedTickers),
          ...(dateRangeType !== 'all' ? [{ key: 'date', label: `Period: ${dateRangeType === 'custom' ? `${startDate || 'Any'} → ${endDate || 'Any'}` : dateRangeType === 'ytd' ? 'Year to date' : dateRangeType === '30d' ? 'Last 30 days' : 'Last 90 days'}`, onRemove: () => { setDateRangeType('all'); setStartDate(''); setEndDate(''); } }] : []),
          ...(visibilityFilter !== 'active' ? [{ key: 'visibility', label: `Status: ${visibilityFilter}`, onRemove: () => setVisibilityFilter('active') }] : []),
          ...(focusTicker ? [{ key: 'source-lot', label: `Source lot: ${focusTicker}${focusDate ? ` · ${focusDate.slice(0, 10)}` : ''}`, onRemove: () => onClearFocus?.() }] : []),
        ]}
        actions={<ColumnsButton count={columnOrder.length} total={allColumns.length} onClick={() => setShowColSheet(true)} />}
        extra={dateRangeType === 'custom' ? <>
          <label className="table-filter-field"><span className="table-field-label">From date</span><input type="date" className="table-filter-trigger" value={startDate} max={endDate || undefined} onChange={event => setStartDate(event.target.value)} /></label>
          <label className="table-filter-field"><span className="table-field-label">To date</span><input type="date" className="table-filter-trigger" value={endDate} min={startDate || undefined} onChange={event => setEndDate(event.target.value)} /></label>
          {startDate && endDate && startDate > endDate && <p className="table-date-error" role="alert">The end date must be on or after the start date.</p>}
        </> : undefined}
      >
        <MultiSelectFilter label="Brokerage" values={selectedBrokerages} options={allBrokerages} onChange={setSelectedBrokerages} emptyLabel="All brokerages" />
        <MultiSelectFilter label="Ticker" values={selectedTickers} options={allTickers} onChange={setSelectedTickers} emptyLabel="All tickers" />
        <MultiSelectFilter label="Asset type" values={selectedAssetTypes} options={allAssetTypes.map(value => ({ value, label: formatAssetType(value) }))} onChange={setSelectedAssetTypes} emptyLabel="All asset types" searchable={false} />
        <SelectFilter label="Period" value={dateRangeType} onChange={value => setDateRangeType(value as DateRangeType)} options={[{ value: 'all', label: 'All time' }, { value: '30d', label: 'Last 30 days' }, { value: '90d', label: 'Last 90 days' }, { value: 'ytd', label: 'Year to date' }, { value: 'custom', label: 'Custom dates' }]} />
        <SelectFilter label="Transaction status" value={visibilityFilter} onChange={value => setVisibilityFilter(value as VisibilityFilter)} options={[{ value: 'active', label: 'Active' }, { value: 'hidden', label: 'Hidden' }, { value: 'duplicates', label: `Duplicates (${transactions.filter(t => t.is_duplicate).length})` }, { value: 'all', label: 'All transactions' }]} />
      </FilterToolbar>

      {filteredTransactions.length === 0 ? (
        <div className="py-20 text-center bg-white border border-[#e7ecf3] rounded">
          <div className="max-w-xs mx-auto space-y-4">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-300">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h4 className="text-slate-900 font-bold">No results found</h4>
            <p className="text-sm text-slate-400">No transactions match these criteria.</p>
            <button onClick={resetFilters} className="text-[#2458d3] text-sm font-bold hover:underline">Clear all filters</button>
          </div>
        </div>
      ) : (
        <div className={`overflow-x-auto rounded border border-[#e7ecf3] bg-white overflow-hidden${!numbersVisible ? ' blur-sm select-none pointer-events-none' : ''}`}>
          <table className="w-full text-left">
            <thead>
              <tr className="bg-[#f6f8fc] border-b border-[#e7ecf3]">
                <th className="px-4 py-2 w-10" title="Hide transaction from calculations">
                  <svg className="w-3.5 h-3.5 text-slate-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                </th>
                {columnOrder.map(renderTh)}
                <th className="px-6 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap text-right">Tools</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e7ecf3]">
              {filteredTransactions.map((t) => {
                const isEditing = editingId === t.id;

                const startEdit = () => {
                  setEditingId(t.id);
                  setEditDraft({
                    date: t.date.slice(0, 10),
                    brokerage: t.brokerage,
                    assetType: t.assetType,
                    ticker: t.ticker,
                    action: t.action,
                    quantity: t.quantity,
                    price: t.price,
                  });
                };

                const saveEdit = () => {
                  const qty = editDraft.quantity ?? t.quantity;
                  const price = editDraft.price ?? t.price;
                  onUpdate(t.id, { ...editDraft, totalCost: qty * price });
                  setEditingId(null);
                  setEditDraft({});
                };

                const cancelEdit = () => {
                  setEditingId(null);
                  setEditDraft({});
                };

                return (
                  <tr key={`${t.brokerage}-${t.id}`} className={`transition-colors group ${isEditing ? 'bg-[#2458d3]/5' : t.is_duplicate ? 'bg-orange-50/60 hover:bg-orange-50' : 'hover:bg-[#f6f8fc]'} ${t.is_deleted && !isEditing ? 'opacity-40' : ''}`}>
                    {/* Hide checkbox */}
                    <td className="px-4 py-2 text-center">
                      {!isEditing && (
                        <input
                          type="checkbox"
                          checked={t.is_deleted}
                          onChange={() => onSoftDelete(t.id, !t.is_deleted)}
                          className="w-4 h-4 rounded border-slate-300 text-slate-400 focus:ring-slate-400 cursor-pointer"
                          title={t.is_deleted ? 'Restore transaction' : 'Hide from calculations'}
                        />
                      )}
                    </td>

                    {columnOrder.map(col => renderCell(col, t, isEditing))}

                    {/* Actions */}
                    <td className="px-6 py-2 text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={saveEdit} className="p-1.5 text-white bg-[#2458d3] hover:bg-[#24436d] rounded transition-all" title="Save">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                          </button>
                          <button onClick={cancelEdit} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded transition-all" title="Cancel">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Transfer button — BUY rows only */}
                          {['BUY', 'REI'].includes(t.action.toUpperCase()) && (
                            <div className="relative" ref={transferPopoverId === t.id ? transferPopoverRef : null}>
                              <button
                                onClick={(e) => transferPopoverId === t.id ? setTransferPopoverId(null) : openTransferPopover(t.id, e.currentTarget)}
                                className={`p-1.5 rounded transition-all ${
                                  t.current_brokerage && t.current_brokerage !== t.brokerage
                                    ? 'text-[#2458d3] bg-[#2458d3]/10 hover:bg-[#2458d3]/20'
                                    : 'text-slate-200 hover:text-[#2458d3] hover:bg-[#2458d3]/10'
                                }`}
                                title={t.current_brokerage && t.current_brokerage !== t.brokerage ? `Lots moved to ${t.current_brokerage}` : 'Move lots to another brokerage'}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                              </button>
                              {transferPopoverId === t.id && (
                                <div className={`absolute right-0 z-50 bg-white rounded-lg shadow-xl border border-slate-100 min-w-[180px] py-1 ${transferPopoverFlip ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                                  <p className="px-3 py-1.5 text-[9px] font-black text-slate-400 uppercase tracking-wider">Move lots to</p>
                                  {(allKnownBrokerages || allBrokerages).filter(b => b !== t.brokerage).map(broker => (
                                    <button
                                      key={broker}
                                      onClick={() => { onUpdate(t.id, { current_brokerage: broker }); setTransferPopoverId(null); }}
                                      className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-slate-50 transition-colors ${t.current_brokerage === broker ? 'text-[#2458d3]' : 'text-slate-700'}`}
                                    >
                                      <BrokerageValue name={broker} compact />
                                      {t.current_brokerage === broker && (
                                        <svg className="w-3 h-3 ml-auto" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                                      )}
                                    </button>
                                  ))}
                                  {t.current_brokerage && t.current_brokerage !== t.brokerage && (
                                    <>
                                      <div className="my-1 border-t border-slate-100" />
                                      <button
                                        onClick={() => { onUpdate(t.id, { current_brokerage: t.brokerage }); setTransferPopoverId(null); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-500 hover:bg-rose-50 transition-colors"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                        Clear transfer
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                          {/* Split button — BUY rows with qty > 0 */}
                          {['BUY', 'REI'].includes(t.action.toUpperCase()) && t.quantity > 0 && (
                            <button
                              onClick={() => openSplitModal(t)}
                              className="p-1.5 rounded transition-all text-slate-200 hover:text-violet-600 hover:bg-violet-50"
                              title="Split lot into two"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" /></svg>
                            </button>
                          )}
                          {/* Lot assignment button — always visible on SELL rows */}
                          {t.action.toUpperCase() === 'SELL' && (
                            <button
                              onClick={() => openLotModal(t)}
                              className={`p-1.5 rounded transition-all ${
                                mappedSellIds.has(t.id)
                                  ? 'text-violet-600 bg-violet-50 hover:bg-violet-100'
                                  : 'text-slate-200 hover:text-violet-600 hover:bg-violet-50'
                              }`}
                              title={mappedSellIds.has(t.id) ? 'Lots manually assigned' : 'Assign buy lots to this sell'}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                            </button>
                          )}
                          {/* Duplicate flag — orange icon, visible when is_duplicate */}
                          {t.is_duplicate && (
                            <span className="p-1.5 rounded bg-orange-50 text-orange-500" title="Flagged as duplicate — review and hide if confirmed">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                            </span>
                          )}
                          {/* Edit button — always visible, amber when overridden */}
                          <button
                            onClick={startEdit}
                            className={`p-1.5 rounded transition-all ${
                              t.is_override
                                ? 'text-amber-500 bg-amber-50 hover:bg-amber-100'
                                : 'text-slate-200 hover:text-[#2458d3] hover:bg-[#f6f8fc]'
                            }`}
                            title={t.is_override ? 'Edited — click to edit again' : 'Edit transaction'}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          {/* Revert — hover only, only when overridden */}
                          {t.is_override && (
                            <div className="opacity-0 group-hover:opacity-100 transition-all">
                              <button onClick={() => onRevert(t.id)} className="p-1.5 text-slate-300 hover:text-amber-600 hover:bg-amber-50 rounded transition-all" title="Revert to original">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                              </button>
                            </div>
                          )}
                          {/* Delete — always visible, grayed */}
                          <button onClick={() => onRemove(t.id)} className="p-1.5 text-slate-200 hover:text-rose-600 hover:bg-rose-50 rounded transition-all" title="Delete transaction">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {/* Lot Assignment Modal */}
      {lotModalSellId && lotModalSellTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-2 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900">Assign Buy Lots</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Sell: <span className="font-bold text-slate-600">{lotModalSellTxn.ticker}</span> &nbsp;·&nbsp;
                  {new Date(lotModalSellTxn.date).toLocaleDateString('en-CA')} &nbsp;·&nbsp;
                  {lotModalSellTxn.quantity} shares @ ${lotModalSellTxn.price.toFixed(2)}
                </p>
              </div>
              <button onClick={closeLotModal} className="p-2 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="px-6 py-2 space-y-5 max-h-[70vh] overflow-y-auto">
              {lotModalError && (
                <div className="text-xs text-rose-600 bg-rose-50 rounded-md px-4 py-3 font-medium">{lotModalError}</div>
              )}

              {/* Existing assignments */}
              {existingAssignments.length > 0 && (
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Existing Assignments</p>
                  <div className="space-y-2">
                    {existingAssignments.map(a => {
                      const buy = openBuys.find(b => b.id === a.buy_transaction_id);
                      return (
                        <div key={a.id} className="flex items-center justify-between px-4 py-2.5 bg-violet-50 rounded-md">
                          <div className="text-sm">
                            <span className="font-bold text-slate-700">{a.quantity} shares</span>
                            {buy && <span className="text-slate-400 ml-2">from {new Date(buy.date).toLocaleDateString('en-CA')} @ ${buy.price.toFixed(2)}</span>}
                          </div>
                          <button onClick={() => removeAssignment(a.id)} className="p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors" title="Remove">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Available buy lots */}
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Available Buy Lots</p>
                {lotModalLoading ? (
                  <div className="text-sm text-slate-400 py-4 text-center">Loading...</div>
                ) : openBuys.length === 0 ? (
                  <div className="text-sm text-slate-400 py-4 text-center">No open buy lots available for this ticker.</div>
                ) : (
                  <div className="space-y-2">
                    {openBuys.map(lot => (
                      <div key={lot.id} className="flex items-center gap-4 px-4 py-3 bg-slate-50 rounded-md">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-slate-700">{new Date(lot.date).toLocaleDateString('en-CA')}</div>
                          <div className="text-xs text-slate-400">
                            {lot.available_quantity} of {lot.quantity} shares available &nbsp;·&nbsp; ${(lot.price ?? 0).toFixed(2)}/share
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            max={lot.available_quantity}
                            step="any"
                            placeholder="Qty"
                            value={assignQtys[lot.id] ?? ''}
                            onChange={e => setAssignQtys(prev => ({ ...prev, [lot.id]: e.target.value }))}
                            className="w-24 px-3 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-violet-400 text-right"
                          />
                          <span className="text-xs text-slate-400">/ {lot.available_quantity}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-2 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
              <p className="text-xs text-slate-400">Remaining quantity falls back to FIFO automatically.</p>
              <div className="flex gap-2">
                <button onClick={closeLotModal} className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-md transition-colors">Cancel</button>
                <button
                  onClick={saveAssignments}
                  disabled={lotModalLoading || Object.values(assignQtys).every(v => !parseFloat(v))}
                  className="px-4 py-2 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Save Assignments
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Split Modal */}
      {splitTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="px-6 py-2 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900">Split Lot</h3>
                <p className="text-xs text-slate-400 mt-0.5">{splitTxn.ticker} · {splitTxn.brokerage} · {new Date(splitTxn.date).toLocaleDateString('en-CA')}</p>
              </div>
              <button onClick={closeSplitModal} className="p-2 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-600 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-slate-50 rounded-lg px-4 py-3 flex items-center justify-between text-sm">
                <span className="text-slate-500 font-medium">Current quantity</span>
                <span className="font-black text-slate-900">{splitTxn.quantity}</span>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wide mb-1.5">Quantity to split off</label>
                <input
                  type="number"
                  min={0}
                  max={splitTxn.quantity}
                  step="any"
                  value={splitQty}
                  onChange={e => { setSplitQty(e.target.value); setSplitError(null); }}
                  onKeyDown={e => e.key === 'Enter' && confirmSplit()}
                  autoFocus
                  placeholder={`0 – ${splitTxn.quantity}`}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                {splitQty && !isNaN(parseFloat(splitQty)) && parseFloat(splitQty) > 0 && parseFloat(splitQty) < splitTxn.quantity && (
                  <p className="text-xs text-slate-400 mt-1.5">
                    Splits into <span className="font-bold text-slate-700">{parseFloat(splitQty)}</span> + <span className="font-bold text-slate-700">{+(splitTxn.quantity - parseFloat(splitQty)).toFixed(6)}</span> shares
                  </p>
                )}
                {splitError && <p className="text-xs text-rose-500 mt-1.5">{splitError}</p>}
              </div>
            </div>
            <div className="px-6 py-2 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={closeSplitModal} className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-md transition-colors">Cancel</button>
              <button
                onClick={confirmSplit}
                disabled={splitLoading || !splitQty || parseFloat(splitQty) <= 0 || parseFloat(splitQty) >= splitTxn.quantity}
                className="px-4 py-2 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {splitLoading ? 'Splitting…' : 'Split'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ColumnOrderSheet
        open={showColSheet}
        onClose={() => setShowColSheet(false)}
        order={allColumns}
        visible={visibleColumns}
        required={REQUIRED_COLS}
        onToggle={toggleColumn}
        onReset={resetColumns}
        presets={COLUMN_PRESETS}
        onPreset={applyColumnPreset}
        labels={COL_LABELS}
        onMove={moveCol}
      />
    </div>
  );
};

export default TransactionsView;
