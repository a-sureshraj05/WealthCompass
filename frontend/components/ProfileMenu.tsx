import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { fetchAccountProfile, saveAccountDisplayName } from '../services/apiService';
import { MAX_DISPLAY_NAME_LENGTH, profileInitials, validateDisplayName } from '../utils/profile';
import './profile-menu.css';
import type { FinancialVisibility } from '../hooks/useFinancialVisibility';
import FinancialVisibilityNotice from './FinancialVisibilityNotice';

export default function ProfileMenu({ onLogout, privacy, preview = false }: { onLogout: () => void | Promise<void>; privacy: FinancialVisibility; preview?: boolean; }) {
  const sample = import.meta.env.DEV && preview;
  const [name, setName] = useState(sample ? 'Jordan Doe' : '');
  const [email, setEmail] = useState(sample ? 'jordan.doe@example.test' : '');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState<'save' | 'logout' | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const alive = useRef(true);
  const operation = useRef(false);
  const dialogId = useId();
  const nameId = useId();
  const busy = !!pending || privacy.saving;
  const displayName = name || 'Your account';
  const initials = profileInitials(name, email);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const profile = await fetchAccountProfile();
      if (!alive.current) return;
      setName(profile.displayName || (sample ? 'Jordan Doe' : ''));
      setEmail(profile.email);
    } catch (error) {
      if (alive.current) setLoadError(error instanceof Error ? error.message : 'Could not load your profile.');
    } finally { if (alive.current) setLoading(false); }
  }, [sample]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => { alive.current = false; };
  }, [load]);

  const close = useCallback((restoreFocus = false) => {
    setOpen(false); setEditing(false); setError(''); setStatus('');
    if (restoreFocus) trigger.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) close();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const control = editing ? panel.current?.querySelector<HTMLInputElement>('input') : panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)');
    control?.focus();
    if (editing && control instanceof HTMLInputElement) control.select();
  }, [open, editing]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (operation.current) return;
    setError('');
    let nextName: string;
    try { nextName = validateDisplayName(draft); }
    catch (error) { setError(error instanceof Error ? error.message : 'Enter a display name.'); return; }
    operation.current = true; setPending('save');
    try {
      const saved = await saveAccountDisplayName(nextName);
      if (alive.current) { setName(saved); setEditing(false); setStatus(sample ? 'Sample name updated for this preview.' : 'Display name updated.'); }
    } catch (error) {
      if (alive.current) setError(error instanceof Error ? error.message : 'Could not save your display name.');
    } finally { operation.current = false; if (alive.current) setPending(null); }
  };

  const logout = async () => {
    if (operation.current) return;
    operation.current = true; setPending('logout'); setError(''); setStatus('');
    try {
      // Try an unsaved preference once more, while keeping sign-out available
      // even if preference storage is down.
      await privacy.flush().catch(() => {});
      await onLogout();
    }
    catch (error) { if (alive.current) setError(error instanceof Error ? error.message : 'Could not sign out. Please try again.'); }
    finally { operation.current = false; if (alive.current) setPending(null); }
  };

  return <div ref={root} className="account-profile" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(true); } }} onBlur={event => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) close(); }}>
    <button ref={trigger} className="profile-trigger" aria-label={`Open account menu for ${displayName}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={dialogId} onClick={() => { if (open) close(); else { setOpen(true); setError(''); setStatus(''); } }}>
      <span className="profile-avatar" aria-hidden="true">{initials}</span>
      <span className="profile-trigger-name">{displayName}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
    {open && <div ref={panel} id={dialogId} className="profile-popover" role="dialog" aria-label={editing ? 'Edit profile' : 'Your account'} aria-busy={loading || busy}>
      <div className="profile-identity">
        <span className="profile-avatar" aria-hidden="true">{initials}</span>
        <div>
          <strong>{displayName}</strong>
          <span>{email || (loading ? 'Loading account…' : 'Account details unavailable')}</span>{sample && <small>Design preview</small>}</div>
      </div>
      {loadError && <div className="profile-load-error" role="alert">
        <p>{loadError}</p>
        <button disabled={loading || busy} onClick={() => void load()}>{loading ? 'Loading…' : 'Retry profile'}</button>
      </div>}
      {status && <p className="profile-status" role="status">{status}</p>}
      {error && <p className="profile-error" role="alert">{error}</p>}
      <FinancialVisibilityNotice privacy={privacy} />
      <div className="profile-privacy">
        <div className="profile-privacy-control">
          <span id={`${dialogId}-privacy-label`}>Hide financial values</span>
          <button type="button" role="switch" aria-checked={!privacy.visible} aria-labelledby={`${dialogId}-privacy-label`} aria-describedby={`${dialogId}-privacy-help`} disabled={!privacy.ready || busy} onClick={() => privacy.setVisible(!privacy.visible)}><span /></button>
        </div>
        <p id={`${dialogId}-privacy-help`}>{privacy.error ? 'Use Retry to save or load your visibility choice.' : !privacy.ready ? 'Figures stay hidden while your saved choice loads.' : privacy.saving ? 'Saving your visibility choice…' : sample ? 'Saved in this browser for your next preview session. Changes save automatically.' : 'Applies now and at your next login. Changes save automatically.'}</p>
      </div>
      {editing ? <form className="profile-editor" onSubmit={save}>
        <label htmlFor={nameId}>Display name</label>
        <input id={nameId} value={draft} onChange={event => setDraft(event.target.value)} maxLength={MAX_DISPLAY_NAME_LENGTH * 2} autoComplete="nickname" disabled={busy} aria-invalid={!!error} aria-describedby={`${nameId}-help`} />
        <p id={`${nameId}-help`}>{sample ? 'Changes stay in this preview’s memory.' : 'Your display name is saved to your account preferences.'} Up to 80 characters.</p>
        <div>
          <button type="button" className="profile-secondary" disabled={busy} onClick={() => { setEditing(false); setError(''); }}>Cancel</button>
          <button className="profile-primary" disabled={busy || !draft.trim()} type="submit">{pending === 'save' ? 'Saving…' : 'Save name'}</button>
        </div>
      </form> : <div className="profile-menu-actions">
        <button disabled={loading || !!loadError || busy} onClick={() => { setDraft(name); setEditing(true); setError(''); setStatus(''); }}>
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15v5Z" />
          </svg>Edit profile</button>
        <button className="profile-sign-out" disabled={busy} onClick={() => void logout()}>
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M10 4H4v16h6m0-8h11m-4-4 4 4-4 4" />
          </svg>{pending === 'logout' ? 'Signing out…' : 'Sign out'}</button>
      </div>}
    </div>}
  </div>;
}
