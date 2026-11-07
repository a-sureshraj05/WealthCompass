import React from 'react';
import type { BrokerageConnection, ProviderAccount } from '../../services/apiService';
import type { SyncScope } from './accountsModel';
import BrokerageLogo from './BrokerageLogo';

interface Props {
  connections: BrokerageConnection[];
  accounts: ProviderAccount[];
  loaded: boolean;
  loadError: string;
  refreshedAt: string;
  busy: boolean;
  refreshing: boolean;
  scope: SyncScope;
  selectedIds: string[];
  onRefresh: () => void;
  onSelection: (ids: string[], scope: SyncScope) => void;
  onToggle: (id: string) => void;
  onManage: (kind: 'hide' | 'disconnect', id: string, name: string) => void;
}

export default function AccountConnections({ connections, accounts, loaded, loadError, refreshedAt, busy, refreshing, scope, selectedIds, onRefresh, onSelection, onToggle, onManage }: Props) {
  const included = (id: string) => scope === 'all' || selectedIds.includes(id);
  const selectedCount = accounts.filter(a => included(a.id)).length;
  const renderAccount = (account: ProviderAccount) => <div className={`ac-account-row${included(account.id) ? ' is-included' : ''}`} key={account.id}>
    <label>
      <input type="checkbox" checked={included(account.id)} disabled={busy || !!loadError} onChange={() => onToggle(account.id)} />
      <span>
        <strong>{account.name || 'Brokerage account'}</strong>
        <small>{included(account.id) ? 'Included in next sync' : 'Excluded from next sync'}</small>
      </span>
    </label>
    <details className="ac-row-menu">
      <summary aria-label={`Manage ${account.name || 'account'}`}>•••</summary>
      <button disabled={busy} onClick={() => onManage('hide', account.id, account.name || 'Account')}>Hide from future sync</button>
    </details>
  </div>;
  const toggleGroup = (ids: string[]) => {
    const current = accounts.filter(a => included(a.id)).map(a => a.id);
    const allIncluded = ids.every(id => current.includes(id));
    onSelection(allIncluded ? current.filter(id => !ids.includes(id)) : [...new Set([...current, ...ids])], 'selected');
  };
  const unlinkedAccounts = accounts.filter(a => !connections.some(c => c.authorization_id === a.authorization_id));

  return <section className="ac-panel" aria-labelledby="ac-your-brokerages">
    <header className="ac-panel-head">
      <div>
        <p className="ac-eyebrow">CHOOSE YOUR SOURCES</p>
        <h2 id="ac-your-brokerages">Your brokerages</h2>
        <p>{loaded && !loadError ? `${connections.length} ${connections.length === 1 ? 'connection' : 'connections'} · ${accounts.length} ${accounts.length === 1 ? 'account' : 'accounts'} available` : 'Select the accounts you want to bring up to date.'}</p>
      </div>
      <button className="ac-button" disabled={busy || !loaded} onClick={onRefresh}>{refreshing ? 'Refreshing…' : '↻ Refresh accounts'}</button>
    </header>
    {!loaded ? <div className="ac-loading-state" role="status">
      <span />
      <span />
      <p>Loading brokerage connections…</p>
    </div>
      : loadError ? <div className="ac-empty ac-load-error" role="alert">
        <strong>Account list unavailable</strong>
        <p>{loadError}</p>
        <span>Statement import remains available for supported brokerages.</span>
      </div>
        : <>
          {!!accounts.length && <div className="ac-selection-bar">
            <span>
              <strong>{selectedCount} of {accounts.length}</strong> accounts in your next sync</span>
            <div>
              <button disabled={busy} onClick={() => onSelection([], 'all')}>Select all</button>
              <span>·</span>
              <button disabled={busy || selectedCount === 0} onClick={() => onSelection([], 'selected')}>Clear selection</button>
            </div>
          </div>}
          {!connections.length && !accounts.length && <div className="ac-empty">
            <span className="ac-empty-mark">↗</span>
            <h3>Connect your first brokerage</h3>
            <p>Choose a provider below, complete sign-in, then refresh your accounts.</p>
          </div>}
          <div className="ac-connection-list">{connections.map(connection => {
            const linked = accounts.filter(a => a.authorization_id === connection.authorization_id);
            const count = linked.filter(a => included(a.id)).length;
            return <article className={`ac-connection${count ? ' has-selection' : ''}`} key={connection.authorization_id}>
              <div className="ac-connection-heading">
                <BrokerageLogo name={connection.brokerage} />
                <div>
                  <h3>{connection.brokerage}</h3>
                  <p>{count} of {linked.length} {linked.length === 1 ? 'account' : 'accounts'} included</p>
                </div>
                <details className="ac-row-menu">
                  <summary aria-label={`Manage ${connection.brokerage} connection`}>•••</summary>
                  <button disabled={busy} onClick={() => onManage('disconnect', connection.authorization_id, connection.brokerage)}>Disconnect brokerage</button>
                </details>
              </div>
              {linked.length ? <>{linked.map(renderAccount)}<div className="ac-group-selection">
                <button disabled={busy} onClick={() => toggleGroup(linked.map(a => a.id))}>{count === linked.length ? 'Exclude this brokerage' : 'Include all accounts'}</button>
              </div>
              </> : <p className="ac-no-accounts">No accounts available. Refresh after completing sign-in, or check the connection with your brokerage.</p>}
            </article>;
          })}{!!unlinkedAccounts.length && <article className="ac-connection">
            <div className="ac-connection-heading">
              <div>
                <h3>Other available accounts</h3>
                <p>Connection details are unavailable for these accounts.</p>
              </div>
            </div>{unlinkedAccounts.map(renderAccount)}</article>}</div>
          {refreshedAt && <p className="ac-refreshed">Account list refreshed at {refreshedAt} · transaction synchronization is a separate action</p>}
        </>}
  </section>;
}
