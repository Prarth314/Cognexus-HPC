import { useEffect, useState, type FormEvent } from 'react';
import { ArrowDownToLine, Check, KeyRound, LoaderCircle, ShieldCheck, LogOut } from 'lucide-react';
import type { User } from '../shared/contracts';
import { api, json, formatDate } from './api';
import { Dialog } from './Dialog';

interface Security {
  sessions: { id: string; created_at: string; expires_at: string; current: boolean }[];
  recoveryCodesRemaining: number;
  events: { id: string; action: string; created_at: string }[];
  emailVerified: boolean;
}
export function Account({
  user,
  onUser,
  onClose,
  onSessionEnded,
}: {
  user: User;
  onUser: (user: User) => void;
  onClose: () => void;
  onSessionEnded: () => void;
}) {
  const [security, setSecurity] = useState<Security | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false),
    [codes, setCodes] = useState<string[]>([]),
    [saved, setSaved] = useState(false);
  async function refresh() {
    setSecurity(await api<Security>('/account/security'));
  }
  useEffect(() => {
    let active = true;
    void api<Security>('/account/security')
      .then((value) => {
        if (active) setSecurity(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function submit(
    event: FormEvent<HTMLFormElement>,
    kind: 'profile' | 'password' | 'codes' | 'sessions',
  ) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (kind === 'profile') {
        const response = await api<{ user: User }>('/account/profile', {
          method: 'PATCH',
          body: json({ name: data.get('name') }),
        });
        onUser(response.user);
        setNotice('Profile saved.');
      }
      if (kind === 'password') {
        const response = await api<{ user: User }>('/account/password', {
          method: 'POST',
          body: json({
            currentPassword: data.get('currentPassword'),
            newPassword: data.get('newPassword'),
          }),
        });
        onUser(response.user);
        form.reset();
        setNotice(
          'Password updated. All previous sessions were revoked; this session was rotated.',
        );
      }
      if (kind === 'codes') {
        const response = await api<{ codes: string[] }>('/account/recovery-codes', {
          method: 'POST',
          body: json({ currentPassword: data.get('currentPassword') }),
        });
        setCodes(response.codes);
        setSaved(false);
        form.reset();
        setNotice('Save these codes offline now. Your previous code set is no longer valid.');
      }
      if (kind === 'sessions') {
        await api('/account/sessions/revoke-others', {
          method: 'POST',
          body: json({ currentPassword: data.get('currentPassword') }),
        });
        form.reset();
        setNotice('Other sessions revoked.');
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string, current: boolean) {
    setBusy(true);
    setError('');
    try {
      await api(`/account/sessions/${id}`, { method: 'DELETE' });
      if (current) {
        onClose();
        onSessionEnded();
      } else {
        await refresh();
        setNotice('Session revoked.');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function saveCodes() {
    const text = `Cognexus recovery codes for ${user.email}\nKeep private and offline. Each code can be used once to reset your password.\nGenerating another set invalidates these codes.\n\n${codes.join('\n')}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cognexus-recovery-codes.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSaved(true);
  }
  return (
    <Dialog title="Your account & security" wide onClose={onClose}>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success-notice" role="status">
          <Check size={16} />
          {notice}
        </p>
      )}
      <div className="account-grid">
        <section className="account-panel">
          <h3>Researcher profile</h3>
          <form className="form-stack" onSubmit={(event) => void submit(event, 'profile')}>
            <label>
              Display name
              <input name="name" required minLength={2} maxLength={100} defaultValue={user.name} />
            </label>
            <label>
              Account email
              <input value={user.email} readOnly />
            </label>
            <p className="form-hint">
              Email ownership is not verified in this restricted pilot. Email changes require a
              future verified-identity flow.
            </p>
            <button className="button secondary" disabled={busy}>
              Save profile
            </button>
          </form>
        </section>
        <section className="account-panel">
          <h3>
            <KeyRound size={16} />
            Change password
          </h3>
          <form className="form-stack" onSubmit={(event) => void submit(event, 'password')}>
            <label>
              Current password
              <input
                name="currentPassword"
                type="password"
                required
                maxLength={128}
                autoComplete="current-password"
              />
            </label>
            <label>
              New password
              <input
                name="newPassword"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
            <p className="form-hint">
              Changing your password revokes all old sessions and rotates your current session.
            </p>
            <button className="button secondary" disabled={busy}>
              Update password
            </button>
          </form>
        </section>
      </div>
      <section className="account-panel recovery-panel">
        <h3>
          <ShieldCheck size={17} />
          Offline recovery codes
        </h3>
        <p>
          Recover your account without an email provider. Generate eight high-entropy, single-use
          codes and keep them in a private offline location. Anyone with a code and your email can
          reset your password.
        </p>
        <p className="form-hint">
          {security
            ? `${security.recoveryCodesRemaining} unused codes available.`
            : 'Loading security settings…'}{' '}
          Codes cannot be retrieved after this dialog closes. If you lose both your password and
          codes, self-service recovery is unavailable.
        </p>
        {codes.length > 0 && (
          <div className="recovery-codes">
            <div>
              {codes.map((code) => (
                <code key={code}>{code}</code>
              ))}
            </div>
            <button className="button primary" onClick={saveCodes}>
              {saved ? <Check size={15} /> : <ArrowDownToLine size={15} />}{' '}
              {saved ? 'Download again' : 'Download private codes'}
            </button>
          </div>
        )}
        <form
          className="form-stack compact-security-form"
          onSubmit={(event) => void submit(event, 'codes')}
        >
          <label>
            Confirm current password
            <input
              name="currentPassword"
              type="password"
              required
              maxLength={128}
              autoComplete="current-password"
            />
          </label>
          <button className="button secondary" disabled={busy}>
            Generate a new code set
          </button>
        </form>
      </section>
      <section className="account-panel">
        <div className="section-heading">
          <div>
            <h3>Active sessions</h3>
            <p>Revocation takes effect on the next protected request.</p>
          </div>
          <a className="button secondary small-button" href="/api/account/export">
            <ArrowDownToLine size={14} />
            Export account metadata
          </a>
        </div>
        {!security ? (
          <LoaderCircle className="spin" size={18} />
        ) : (
          <div className="session-list">
            {security.sessions.map((item) => (
              <div className="session-item" key={item.id}>
                <div>
                  <strong>{item.current ? 'This session' : 'Other session'}</strong>
                  <small>
                    Created {formatDate(item.created_at)} · expires {formatDate(item.expires_at)}
                  </small>
                </div>
                <button
                  className="button secondary small-button"
                  disabled={busy}
                  onClick={() => void revoke(item.id, item.current)}
                >
                  <LogOut size={14} />
                  {item.current ? 'Sign out' : 'Revoke'}
                </button>
              </div>
            ))}
          </div>
        )}
        <form
          className="form-stack compact-security-form"
          onSubmit={(event) => void submit(event, 'sessions')}
        >
          <label>
            Confirm password to revoke other sessions
            <input
              name="currentPassword"
              type="password"
              required
              maxLength={128}
              autoComplete="current-password"
            />
          </label>
          <button className="button secondary" disabled={busy}>
            Revoke other sessions
          </button>
        </form>
      </section>
      <section className="account-panel">
        <h3>Recent security activity</h3>
        {security?.events.length ? (
          <ol className="security-events">
            {security.events.map((event) => (
              <li key={event.id}>
                <span>{event.action.replaceAll('.', ' · ').replaceAll('_', ' ')}</span>
                <time>{formatDate(event.created_at)}</time>
              </li>
            ))}
          </ol>
        ) : (
          <p className="form-hint">No account-security events recorded yet.</p>
        )}
      </section>
    </Dialog>
  );
}

export function RecoverAccount({ onClose }: { onClose: () => void }) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError('');
    setBusy(true);
    try {
      await api('/auth/recover', {
        method: 'POST',
        body: json({
          email: data.get('email'),
          code: String(data.get('code')).trim().toLowerCase(),
          newPassword: data.get('newPassword'),
        }),
      });
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Recover your account" onClose={onClose}>
      {done ? (
        <div className="form-stack">
          <p className="success-notice">
            Password reset. Previous sessions have been revoked. Sign in with your new password.
          </p>
          <button className="button primary" onClick={onClose}>
            Return to sign in
          </button>
        </div>
      ) : (
        <form className="form-stack" onSubmit={submit}>
          <p>
            Use a previously saved recovery code. Each code works once. This form does not send
            email or create new recovery codes.
          </p>
          <label>
            Account email
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label>
            Unused recovery code
            <input
              name="code"
              required
              minLength={32}
              maxLength={32}
              pattern="[a-fA-F0-9]{32}"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label>
            New password
            <input
              name="newPassword"
              type="password"
              minLength={12}
              maxLength={128}
              required
              autoComplete="new-password"
            />
          </label>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? 'Resetting…' : 'Reset password & revoke sessions'}
          </button>
        </form>
      )}
    </Dialog>
  );
}
