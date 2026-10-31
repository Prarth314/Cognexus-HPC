import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Download,
  FileCheck2,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import type { Project, Run } from '../shared/contracts';
import type { HandoverSummary, HandoverDetail } from '../shared/handover';
import { api, json, formatDate } from './api';
import { Dialog } from './Dialog';

export function Handovers({
  project,
  runs,
  onError,
}: {
  project: Project;
  runs: Run[];
  onError: (message: string) => void;
}) {
  const [items, setItems] = useState<HandoverSummary[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [detail, setDetail] = useState<HandoverDetail | null>(null);
  const [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState('');
  const [verificationRefresh, setVerificationRefresh] = useState(0);
  const canWrite = project.role !== 'viewer' && !project.archived_at,
    completed = runs.filter(
      (run) => run.status === 'succeeded' && run.validation_status === 'valid',
    );
  async function reload() {
    setItems(await api<HandoverSummary[]>(`/projects/${project.id}/handovers`));
  }
  useEffect(() => {
    let active = true;
    void api<HandoverSummary[]>(`/projects/${project.id}/handovers`)
      .then((value) => {
        if (active) setItems(value);
      })
      .catch((error) => {
        if (active) onError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [project.id]);
  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let active = true,
      timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const value = await api<HandoverDetail>(`/handovers/${selected}`);
        if (active) {
          setDetail(value);
          if (value.verifications.some((check) => ['queued', 'running'].includes(check.status)))
            timer = setTimeout(() => void poll(), 2500);
        }
      } catch (error) {
        if (active) {
          setDetail(null);
          onError((error as Error).message);
        }
      }
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [selected, verificationRefresh]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setNotice('');
    try {
      const value = await api<{ id: string }>(`/projects/${project.id}/handovers`, {
        method: 'POST',
        body: json({
          sourceRunId: form.get('sourceRunId'),
          title: form.get('title'),
          notes: form.get('notes'),
          tolerance: {
            absolute: Number(form.get('absolute')),
            relative: Number(form.get('relative')),
          },
        }),
      });
      await reload();
      setCreating(false);
      setSelected(value.id);
      setDetail(null);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    if (!selected) return;
    setBusy(true);
    try {
      await api(`/handovers/${selected}/verify`, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      });
      setNotice('Verification queued in a fresh bounded worker.');
      setDetail(await api<HandoverDetail>(`/handovers/${selected}`));
      setVerificationRefresh((previous) => previous + 1);
      await reload();
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function importPackage(event: FormEvent<HTMLInputElement>) {
    const element = event.currentTarget,
      file = element.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      onError('Choose a handover JSON package no larger than 3 MiB.');
      element.value = '';
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.set('file', file);
      const value = await api<{ id: string }>(`/projects/${project.id}/handovers/import`, {
        method: 'POST',
        body: form,
      });
      await reload();
      setDetail(null);
      setSelected(value.id);
      setNotice('Imported reference. Original authorship has not been verified.');
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
      element.value = '';
    }
  }
  return (
    <section className="handover-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">RESEARCH THAT OUTLASTS THE HANDOVER</p>
          <h2>Make your next handover verifiable.</h2>
          <p>Freeze a reference, check what is missing, and let another researcher reproduce it.</p>
        </div>
      </div>
      <div className="handover-intro">
        <div>
          <FileCheck2 size={24} />
          <strong>One reference. A clear trail.</strong>
          <p>
            Inputs, parameters, implementation fingerprint and expected outputs travel together.
          </p>
        </div>
        <div>
          <RefreshCw size={24} />
          <strong>A fresh execution.</strong>
          <p>Verification uses the approved workflow in a new worker on this backend.</p>
        </div>
        <div>
          <ShieldCheck size={24} />
          <strong>Honest verification.</strong>
          <p>
            Author reruns and different-member checks are labeled separately. Matching is not
            scientific validation.
          </p>
        </div>
      </div>
      <div className="handover-toolbar">
        {canWrite && (
          <>
            <button
              className="button primary"
              disabled={busy || !completed.length}
              onClick={() => setCreating(true)}
            >
              <Plus size={16} />
              Create handover
            </button>
            <label className={`button secondary ${busy ? 'disabled' : ''}`}>
              <Upload size={16} />
              Import package
              <input
                type="file"
                accept=".json,application/json"
                disabled={busy}
                onChange={(event) => void importPackage(event)}
                className="sr-only"
              />
            </label>
          </>
        )}
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void reload().catch((error) => onError(error.message))}
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>
      {!completed.length && canWrite && (
        <p className="form-hint">
          Complete an approved experiment first. This version supports Dataset statistics and Seeded
          Monte Carlo; it does not import or execute arbitrary scripts.
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {loading ? (
        <p role="status">
          <LoaderCircle className="spin" size={18} /> Loading handovers…
        </p>
      ) : !items.length ? (
        <div className="empty-state">
          <FileCheck2 size={32} />
          <h3>Leave a working experiment behind.</h3>
          <p>Create a handover from a completed run, or import a portable Cognexus package.</p>
        </div>
      ) : (
        <div className="handover-grid">
          {items.map((item) => (
            <button
              key={item.id}
              className="handover-card"
              onClick={() => {
                setDetail(null);
                setSelected(item.id);
                setNotice('');
              }}
            >
              <span className="role-pill">
                {item.origin === 'native' ? 'Recorded reference' : 'Imported reference'}
              </span>
              <h3>{item.title}</h3>
              <p>{item.workflow === 'csv-summary' ? 'Dataset statistics' : 'Seeded Monte Carlo'}</p>
              <small>
                {item.checks} verification requests · {formatDate(item.created_at)}
              </small>
              <span className="text-link">
                Inspect handover <ArrowRight size={15} />
              </span>
            </button>
          ))}
        </div>
      )}
      {creating && (
        <Dialog title="Create a research handover" onClose={() => setCreating(false)}>
          <form className="form-stack" onSubmit={create}>
            <label>
              Handover title
              <input
                name="title"
                required
                minLength={2}
                maxLength={120}
                placeholder="A reproducible starting point for the next researcher"
              />
            </label>
            <label>
              Completed reference experiment
              <select name="sourceRunId" required>
                {completed.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.workflow} · {run.id.slice(0, 8)} · {formatDate(run.created_at)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Handover instructions
              <textarea
                name="notes"
                maxLength={4000}
                rows={4}
                placeholder="Describe the purpose, input meaning, assumptions, and what the next person should review."
              />
            </label>
            <div className="form-row">
              <label>
                Absolute tolerance
                <input
                  type="number"
                  name="absolute"
                  min="0"
                  max="0.001"
                  step="any"
                  defaultValue="0"
                  required
                />
              </label>
              <label>
                Relative tolerance
                <input
                  type="number"
                  name="relative"
                  min="0"
                  max="0.001"
                  step="any"
                  defaultValue="0"
                  required
                />
              </label>
            </div>
            <p className="form-hint">
              Zero means exact comparison. Fractional values use the larger of absolute tolerance
              and relative tolerance × |reference|. Integer values always require an exact match.
              Tolerances are fixed when this handover is created.
            </p>
            <button className="button primary" disabled={busy}>
              {busy ? 'Creating…' : 'Freeze reference'}
              <ArrowRight size={16} />
            </button>
          </form>
        </Dialog>
      )}
      {selected && (
        <Dialog
          wide
          title={detail?.title || 'Inspect handover'}
          onClose={() => {
            setSelected(null);
            setNotice('');
          }}
        >
          {!detail ? (
            <p role="status">Loading handover evidence…</p>
          ) : (
            <div className="form-stack">
              <div className="notice">
                <ShieldCheck size={18} />
                <span>
                  {detail.origin === 'imported'
                    ? 'Imported reference: its original authorship is unverified. A checksum protects package integrity, not authenticity.'
                    : 'Ask a different project member with collaborator or owner access to verify this reference.'}
                </span>
              </div>
              {detail.notes && <p className="handover-notes">{detail.notes}</p>}
              <h3>Preflight checks</h3>
              <ul className="handover-checklist">
                {detail.preflight.checks.map((check) => (
                  <li key={check.label}>
                    <span className={`status ${check.ok ? 'status-succeeded' : 'status-failed'}`}>
                      {check.ok ? 'Ready' : 'Needs attention'}
                    </span>
                    <div>
                      <strong>{check.label}</strong>
                      <p>{check.message}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="handover-toolbar">
                {canWrite && (
                  <button
                    className="button primary"
                    disabled={busy || !detail.preflight.ready}
                    onClick={() => void verify()}
                  >
                    <RefreshCw size={16} />
                    {busy ? 'Queuing…' : 'Verify handover'}
                  </button>
                )}
                <a className="button secondary" href={`/api/handovers/${detail.id}/report`}>
                  <Download size={16} />
                  Download report
                </a>
                {detail.preflight.ready && (
                  <a className="button secondary" href={`/api/handovers/${detail.id}/export`}>
                    <Download size={16} />
                    Export package
                  </a>
                )}
              </div>
              <p className="form-hint">
                Export includes the actual input dataset (up to 2 MiB), reference results and
                instructions. Share it only with intended recipients. Reports contain metadata and
                comparisons, without raw input bytes.
              </p>
              <details>
                <summary>Reference settings and evidence</summary>
                <pre className="file-preview">{JSON.stringify(detail.reference, null, 2)}</pre>
              </details>
              <h3>Verification history</h3>
              {!detail.verifications.length ? (
                <p className="muted">No verification has been requested yet.</p>
              ) : (
                detail.verifications.map((check) => (
                  <article className="handover-result" key={check.id}>
                    <div className="section-heading">
                      <div>
                        <strong>{check.verifier}</strong>
                        <p>
                          {formatDate(check.createdAt)} · Run {check.runId.slice(0, 8)}
                        </p>
                      </div>
                      <span
                        className={`status ${check.status === 'matched' ? 'status-succeeded' : check.status === 'different' ? 'status-failed' : `status-${check.status}`}`}
                      >
                        {check.status}
                      </span>
                    </div>
                    <p>
                      {check.independent
                        ? 'Different-member verification (both accounts used this backend).'
                        : detail.origin === 'imported'
                          ? 'Comparison against an imported reference; authorship unverified.'
                          : 'Author or package-creator rerun; not a different-member verification.'}
                    </p>
                    {check.environmentDifferences.length > 0 && (
                      <p className="form-hint">
                        Environment differences: {check.environmentDifferences.join(', ')}. This is
                        not a separate operating-system deployment.
                      </p>
                    )}
                    {check.error && <p role="status">{check.error}</p>}
                    {check.fields.length > 0 && (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Output</th>
                              <th>Reference</th>
                              <th>Rerun</th>
                              <th>Comparison</th>
                            </tr>
                          </thead>
                          <tbody>
                            {check.fields.map((field) => (
                              <tr key={field.path}>
                                <td>{field.path}</td>
                                <td>{String(field.expected ?? 'null')}</td>
                                <td>{String(field.actual ?? 'null')}</td>
                                <td>
                                  {field.matches ? 'Matches' : 'Different'}
                                  {field.allowedDifference !== null && (
                                    <small> · tolerance {field.allowedDifference}</small>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </article>
                ))
              )}
              <p className="form-hint">
                A different account is not proof of a different human. Verification demonstrates the
                recorded comparison for an approved local workflow, not scientific validity or
                institutional HPC execution.
              </p>
            </div>
          )}
        </Dialog>
      )}
    </section>
  );
}
