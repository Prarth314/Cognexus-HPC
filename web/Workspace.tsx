import { useEffect, useState, type FormEvent } from 'react';
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  FileCheck2,
  FileSpreadsheet,
  FlaskConical,
  FolderOpen,
  GitCompareArrows,
  Info,
  LoaderCircle,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import {
  WORKFLOWS,
  type Project,
  type User,
  type StoredFile,
  type Run,
  type RunRequest,
  type Role,
} from '../shared/contracts';
import { api, json, formatBytes, formatDate } from './api';
import { Dialog } from './Dialog';

type Member = User & { role: Role };
type Audit = {
  id: string;
  actor: string;
  action: string;
  created_at: string;
  details: Record<string, unknown>;
};
type Preview = {
  kind: string;
  headers?: string[];
  rows?: string[][];
  text?: string;
  message?: string;
  truncated?: boolean;
};
type Analysis = { id: string; question: string; answer: string; model: string; evidence: unknown };
const workflowName = (id: string) => WORKFLOWS.find((w) => w.id === id)?.name || id;
const numericEntries = (value: Record<string, unknown> | null) =>
  Object.entries(value || {}).filter(
    (pair): pair is [string, number] => typeof pair[1] === 'number',
  );
const pretty = (value: unknown) =>
  typeof value === 'number'
    ? Number.isInteger(value)
      ? value.toLocaleString()
      : value.toLocaleString(undefined, { maximumSignificantDigits: 8 })
    : String(value ?? '—');

export function Workspace({
  project,
  user,
  aiEnabled,
  onError,
  onRefresh,
}: {
  project: Project;
  user: User;
  aiEnabled: boolean;
  onError: (message: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const [tab, setTab] = useState<'runs' | 'files' | 'people' | 'activity'>('runs');
  const [runs, setRuns] = useState<Run[]>([]),
    [files, setFiles] = useState<StoredFile[]>([]),
    [members, setMembers] = useState<Member[]>([]),
    [events, setEvents] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [creating, setCreating] = useState(false),
    [inviting, setInviting] = useState(false);
  const [selected, setSelected] = useState<string | null>(null),
    [preview, setPreview] = useState<{ name: string; data: Preview } | null>(null),
    [copied, setCopied] = useState(false);
  const [compare, setCompare] = useState<string[]>([]),
    [comparing, setComparing] = useState(false),
    [inviteToken, setInviteToken] = useState('');
  const [defaults, setDefaults] = useState<RunRequest | undefined>();
  const [query, setQuery] = useState('');
  const canWrite = project.role !== 'viewer';
  async function refresh() {
    const [nextRuns, nextFiles, nextMembers, nextEvents] = await Promise.all([
      api<Run[]>(`/projects/${project.id}/runs`),
      api<StoredFile[]>(`/projects/${project.id}/files`),
      api<Member[]>(`/projects/${project.id}/members`),
      api<Audit[]>(`/projects/${project.id}/audit`),
    ]);
    setRuns(nextRuns);
    setFiles(nextFiles);
    setMembers(nextMembers);
    setEvents(nextEvents);
  }
  useEffect(() => {
    let active = true;
    let timeout: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const values = await Promise.all([
          api<Run[]>(`/projects/${project.id}/runs`),
          api<StoredFile[]>(`/projects/${project.id}/files`),
          api<Member[]>(`/projects/${project.id}/members`),
          api<Audit[]>(`/projects/${project.id}/audit`),
        ]);
        if (active) {
          setRuns(values[0]);
          setFiles(values[1]);
          setMembers(values[2]);
          setEvents(values[3]);
        }
      } catch (error) {
        if (active) onError((error as Error).message);
      } finally {
        if (active) {
          setLoading(false);
          timeout = setTimeout(() => void poll(), 4000);
        }
      }
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [project.id]);
  async function upload(event: FormEvent<HTMLInputElement>) {
    const input = event.currentTarget,
      file = input.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      onError('Choose a file smaller than 10 MiB.');
      input.value = '';
      return;
    }
    setBusy(true);
    const form = new FormData();
    form.set('file', file);
    try {
      await api(`/projects/${project.id}/files`, { method: 'POST', body: form });
      await refresh();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
      input.value = '';
    }
  }
  async function showPreview(file: StoredFile) {
    try {
      setPreview({ name: file.name, data: await api<Preview>(`/files/${file.id}/preview`) });
    } catch (e) {
      onError((e as Error).message);
    }
  }
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const response = await api<{ token: string }>(`/projects/${project.id}/invitations`, {
        method: 'POST',
        body: json({ email: data.get('email'), role: data.get('role') }),
      });
      setInviteToken(response.token);
      await refresh();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function changeMember(member: Member, role: Role) {
    setBusy(true);
    try {
      await api(`/projects/${project.id}/members/${member.id}`, {
        method: 'PATCH',
        body: json({ role }),
      });
      await refresh();
      await onRefresh();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function removeMember(member: Member) {
    if (!confirm(`Remove ${member.name} from this project?`)) return;
    setBusy(true);
    try {
      await api(`/projects/${project.id}/members/${member.id}`, { method: 'DELETE' });
      await refresh();
      await onRefresh();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const selectedRun = runs.find((run) => run.id === selected);
  const complete = runs.filter((run) => run.status === 'succeeded').length;
  return (
    <div className="workspace-page page-enter">
      <div className="project-heading">
        <div>
          <p className="eyebrow">{project.domain}</p>
          <h1>{project.name}</h1>
          <p className="subtitle">
            {project.description || 'Follow your questions. Keep the evidence.'}
          </p>
        </div>
        {canWrite && (
          <button
            className="button primary"
            onClick={() => {
              setDefaults(undefined);
              setCreating(true);
            }}
          >
            <Plus size={17} />
            New experiment
          </button>
        )}
      </div>
      <div className="project-metadata">
        <span className="role-pill">{project.role}</span>
        <span>
          <Users size={14} />
          {members.length} {members.length === 1 ? 'researcher' : 'researchers'}
        </span>
        <span>
          <ShieldCheck size={14} />
          Private project
        </span>
        <span>
          <span className="live-dot" />
          Local CPU worker
        </span>
      </div>
      <div className="project-summary">
        <div>
          <span>Total experiments</span>
          <strong>{runs.length.toString().padStart(2, '0')}</strong>
          <FlaskConical size={22} />
        </div>
        <div>
          <span>Completed runs</span>
          <strong>{complete.toString().padStart(2, '0')}</strong>
          <FileCheck2 size={22} />
        </div>
        <div>
          <span>Stored artifacts</span>
          <strong>{files.length.toString().padStart(2, '0')}</strong>
          <FolderOpen size={22} />
        </div>
      </div>
      <nav className="tabs" aria-label="Project sections">
        {(
          [
            { id: 'runs', label: 'Experiments', icon: FlaskConical },
            { id: 'files', label: 'Files & artifacts', icon: FolderOpen },
            { id: 'people', label: 'People', icon: Users },
            { id: 'activity', label: 'Activity', icon: Activity },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            className={tab === item.id ? 'tab active' : 'tab'}
            onClick={() => setTab(item.id)}
            aria-current={tab === item.id ? 'page' : undefined}
          >
            <item.icon size={16} />
            {item.label}
          </button>
        ))}
      </nav>
      {loading ? (
        <div className="empty-state">
          <LoaderCircle className="spin" />
          Loading project evidence…
        </div>
      ) : (
        <>
          {tab === 'runs' && (
            <>
              <div className="section-heading">
                <div>
                  <h2>Experiments</h2>
                  <p>Every run is a question with a record.</p>
                </div>
                {compare.length === 2 && (
                  <button className="button secondary" onClick={() => setComparing(true)}>
                    <GitCompareArrows size={16} />
                    Compare selected runs
                  </button>
                )}
              </div>
              {!runs.length ? (
                <div className="experiment-empty">
                  <span className="empty-art">
                    <FlaskConical size={34} />
                  </span>
                  <h3>Your next question belongs here.</h3>
                  <p>
                    Run a reproducible Monte Carlo experiment, or explore
                    <br />
                    descriptive statistics from your own CSV dataset.
                  </p>
                  {canWrite && (
                    <button className="button primary" onClick={() => setCreating(true)}>
                      <Play size={15} />
                      Start your first experiment
                    </button>
                  )}
                  <small>Actual CPU execution · Versioned parameters · Downloadable evidence</small>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>
                          <span className="sr-only">Select for comparison</span>
                        </th>
                        <th>Experiment</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Attempts</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((run) => (
                        <tr key={run.id}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`Compare run ${run.id.slice(0, 8)}`}
                              checked={compare.includes(run.id)}
                              disabled={
                                run.status !== 'succeeded' ||
                                (!compare.includes(run.id) && compare.length >= 2)
                              }
                              onChange={() =>
                                setCompare((previous) =>
                                  previous.includes(run.id)
                                    ? previous.filter((id) => id !== run.id)
                                    : [...previous, run.id],
                                )
                              }
                            />
                          </td>
                          <td>
                            <button className="run-link" onClick={() => setSelected(run.id)}>
                              <span className="run-icon">
                                <FlaskConical size={17} />
                              </span>
                              <span>
                                {workflowName(run.workflow)}
                                <small>{run.id.slice(0, 8)}</small>
                              </span>
                            </button>
                          </td>
                          <td>
                            <Status status={run.status} />
                          </td>
                          <td className="muted">{formatDate(run.created_at)}</td>
                          <td>{run.attempt}</td>
                          <td>
                            <button
                              className="icon-button"
                              aria-label={`Open run ${run.id.slice(0, 8)}`}
                              onClick={() => setSelected(run.id)}
                            >
                              <ArrowUpRight size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="notice">
                <Info size={16} />
                <span>
                  These reference workflows run on a local CPU worker. Institutional HPC integration
                  and domain-specific scientific validation remain planned.
                </span>
              </div>
            </>
          )}
          {tab === 'files' && (
            <>
              <div className="section-heading">
                <div>
                  <h2>Files & artifacts</h2>
                  <p>Immutable uploads. Verified inputs. Real outputs.</p>
                </div>
                {canWrite && (
                  <label className={`button primary upload-label ${busy ? 'disabled' : ''}`}>
                    <Upload size={16} />
                    {busy ? 'Uploading…' : 'Upload file'}
                    <input type="file" disabled={busy} onChange={upload} aria-label="Upload file" />
                  </label>
                )}
              </div>
              <label className="search-field file-search">
                <Search size={16} />
                <input
                  aria-label="Search files"
                  placeholder="Search files…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              {!files.length ? (
                <div className="empty-state">
                  <FolderOpen size={30} />
                  <h3>A home for your evidence.</h3>
                  <p>Upload a dataset to get started. Maximum 10 MiB per file.</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>File</th>
                        <th>Size</th>
                        <th>Origin</th>
                        <th>SHA-256</th>
                        <th>Added</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {files
                        .filter((file) => file.name.toLowerCase().includes(query.toLowerCase()))
                        .map((file) => (
                          <tr key={file.id}>
                            <td>
                              <button className="run-link" onClick={() => void showPreview(file)}>
                                <FileSpreadsheet size={19} />
                                <span>
                                  {file.name}
                                  <small>Version {file.id.slice(0, 8)}</small>
                                </span>
                              </button>
                            </td>
                            <td>{formatBytes(file.bytes)}</td>
                            <td>
                              <span className="role-pill">
                                {file.source_run_id ? 'Result' : 'Upload'}
                              </span>
                            </td>
                            <td>
                              <code title={file.sha256}>{file.sha256.slice(0, 12)}…</code>
                            </td>
                            <td className="muted">{formatDate(file.created_at)}</td>
                            <td>
                              <a
                                className="icon-button"
                                href={`/api/files/${file.id}/download`}
                                aria-label={`Download ${file.name}`}
                              >
                                <ArrowDownToLine size={17} />
                              </a>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="form-hint">
                Each upload creates a separate immutable version. Project quota: 250 MiB / 500
                files. No scientific units are inferred from filenames.
              </p>
            </>
          )}
          {tab === 'people' && (
            <>
              <div className="section-heading">
                <div>
                  <h2>Connected minds</h2>
                  <p>Explicit access for everyone in the room.</p>
                </div>
                {project.role === 'owner' && (
                  <button
                    className="button primary"
                    onClick={() => {
                      setInviting(true);
                      setInviteToken('');
                      setCopied(false);
                    }}
                  >
                    <Plus size={16} />
                    Invite researcher
                  </button>
                )}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Researcher</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => (
                      <tr key={member.id}>
                        <td>
                          <span className="member-name">
                            <span className="avatar">{member.name[0]}</span>
                            {member.name}
                            {member.id === user.id && <small>(you)</small>}
                          </span>
                        </td>
                        <td className="muted">{member.email}</td>
                        <td>
                          {project.role === 'owner' ? (
                            <select
                              aria-label={`Role for ${member.name}`}
                              value={member.role}
                              disabled={busy}
                              onChange={(e) => void changeMember(member, e.target.value as Role)}
                            >
                              <option value="owner">Owner</option>
                              <option value="collaborator">Collaborator</option>
                              <option value="viewer">Viewer</option>
                            </select>
                          ) : (
                            <span className="role-pill">{member.role}</span>
                          )}
                        </td>
                        <td>
                          {project.role === 'owner' && (
                            <button
                              className="icon-button danger-text"
                              disabled={busy}
                              aria-label={`Remove ${member.name}`}
                              onClick={() => void removeMember(member)}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="notice">
                <ShieldCheck size={16} />
                <span>
                  Owners manage membership. Collaborators upload and run experiments. Viewers
                  inspect evidence. The last owner is protected.
                </span>
              </div>
            </>
          )}
          {tab === 'activity' && (
            <>
              <div className="section-heading">
                <div>
                  <h2>The research record</h2>
                  <p>Who changed what, and when.</p>
                </div>
              </div>
              <div className="activity-list">
                {events.map((event) => (
                  <div className="activity-item" key={event.id}>
                    <span className="activity-marker">
                      <Activity size={16} />
                    </span>
                    <div>
                      <strong>{event.action.replaceAll('.', ' · ').replaceAll('_', ' ')}</strong>
                      <p>{event.actor}</p>
                      {Object.keys(event.details).length > 0 && <code>{json(event.details)}</code>}
                    </div>
                    <time>{formatDate(event.created_at)}</time>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {creating && (
        <NewRun
          project={project}
          files={files}
          defaults={defaults}
          onClose={() => setCreating(false)}
          onCreated={async (id) => {
            setCreating(false);
            setSelected(id);
            setTab('runs');
            await refresh();
          }}
        />
      )}
      {selectedRun && (
        <RunDetail
          run={selectedRun}
          aiEnabled={aiEnabled}
          canWrite={canWrite}
          onClose={() => setSelected(null)}
          onError={onError}
          onRefresh={refresh}
          onClone={() => {
            setDefaults(
              selectedRun.workflow === 'csv-summary'
                ? {
                    workflow: 'csv-summary',
                    inputFileId: selectedRun.input_file_id!,
                    parameters: { column: String(selectedRun.parameters.column) },
                  }
                : {
                    workflow: 'monte-carlo-pi',
                    parameters: {
                      samples: Number(selectedRun.parameters.samples),
                      seed: Number(selectedRun.parameters.seed),
                    },
                  },
            );
            setSelected(null);
            setCreating(true);
          }}
        />
      )}
      {comparing && (
        <Dialog title="Compare the evidence" wide onClose={() => setComparing(false)}>
          <Comparison runs={runs.filter((run) => compare.includes(run.id))} />
        </Dialog>
      )}
      {preview && (
        <Dialog title={preview.name} wide onClose={() => setPreview(null)}>
          {preview.data.kind === 'table' ? (
            <>
              <p className="form-hint">First 20 data rows from the actual file.</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {preview.data.headers?.map((header, index) => (
                        <th key={index}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.data.rows?.map((row, index) => (
                      <tr key={index}>
                        {row.map((cell, i) => (
                          <td key={i}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : preview.data.kind === 'text' ? (
            <pre className="file-preview">
              {preview.data.text}
              {preview.data.truncated ? '\n… preview truncated' : ''}
            </pre>
          ) : (
            <p>{preview.data.message}</p>
          )}
        </Dialog>
      )}
      {inviting && (
        <Dialog title="Invite a connected mind" onClose={() => setInviting(false)}>
          {inviteToken ? (
            <div className="form-stack">
              <p>
                Share this code privately with the recipient. It expires in 48 hours and can be used
                once. No email has been sent.
              </p>
              <code className="invite-code">{inviteToken}</code>
              <button
                className="button primary"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(inviteToken)
                    .then(() => setCopied(true))
                    .catch(() =>
                      onError('Clipboard unavailable. Select and copy the code manually.'),
                    )
                }
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}{' '}
                {copied ? 'Copied' : 'Copy invitation code'}
              </button>
            </div>
          ) : (
            <form className="form-stack" onSubmit={invite}>
              <label>
                Recipient email
                <input name="email" type="email" required autoFocus />
              </label>
              <label>
                Project role
                <select name="role">
                  <option value="collaborator">Collaborator</option>
                  <option value="viewer">Viewer</option>
                </select>
              </label>
              <p className="form-hint">
                The recipient needs an account with this email. Production registration requires an
                operator access code.
              </p>
              <button className="button primary" disabled={busy}>
                {busy ? 'Creating…' : 'Create private invitation'}
                <ArrowRight size={16} />
              </button>
            </form>
          )}
        </Dialog>
      )}
    </div>
  );
}

function Status({ status }: { status: string }) {
  return (
    <span className={`status status-${status}`}>
      <span />
      {status === 'running'
        ? 'Running'
        : status === 'queued'
          ? 'Queued'
          : status === 'succeeded'
            ? 'Completed'
            : status === 'cancelled'
              ? 'Cancelled'
              : 'Failed'}
    </span>
  );
}

function NewRun({
  project,
  files,
  defaults,
  onClose,
  onCreated,
}: {
  project: Project;
  files: StoredFile[];
  defaults?: RunRequest;
  onClose: () => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const [workflow, setWorkflow] = useState(defaults?.workflow || 'monte-carlo-pi');
  const [review, setReview] = useState<RunRequest | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setReview(
      workflow === 'csv-summary'
        ? {
            workflow: 'csv-summary',
            inputFileId: String(data.get('file')),
            parameters: { column: String(data.get('column')) },
          }
        : {
            workflow: 'monte-carlo-pi',
            parameters: { samples: Number(data.get('samples')), seed: Number(data.get('seed')) },
          },
    );
  }
  async function submit() {
    setBusy(true);
    setError('');
    try {
      const response = await api<{ id: string }>(`/projects/${project.id}/runs`, {
        method: 'POST',
        headers: { 'idempotency-key': key },
        body: json(review),
      });
      await onCreated(response.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={review ? 'Review your experiment' : 'A question worth running'}
      onClose={onClose}
    >
      {review ? (
        <div className="form-stack">
          <div className="review-card">
            <span className="eyebrow">EXECUTION PREVIEW</span>
            <h3>{workflowName(review.workflow)}</h3>
            <dl>
              <dt>Environment</dt>
              <dd>Local CPU worker</dd>
              <dt>Maximum runtime</dt>
              <dd>30 seconds</dd>
              <dt>Worker heap limit</dt>
              <dd>128 MiB</dd>
              {Object.entries(review.parameters).map(([name, value]) => (
                <div className="dl-pair" key={name}>
                  <dt>{name}</dt>
                  <dd>{String(value)}</dd>
                </div>
              ))}
              {review.workflow === 'csv-summary' && (
                <>
                  <dt>Input version</dt>
                  <dd>
                    {files.find((file) => file.id === review.inputFileId)?.name}
                    <code>
                      {files.find((file) => file.id === review.inputFileId)?.sha256.slice(0, 20)}…
                    </code>
                  </dd>
                </>
              )}
            </dl>
          </div>
          <p className="form-hint">
            Parameters and input checksums are pinned at submission. This runs real bounded CPU
            computation; it does not use a university cluster.
          </p>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy} onClick={() => void submit()}>
            {busy ? <LoaderCircle className="spin" size={16} /> : <Play size={16} />}Submit
            experiment
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => {
              setReview(null);
              setError('');
            }}
          >
            Edit configuration
          </button>
        </div>
      ) : (
        <form className="form-stack" onSubmit={prepare}>
          <label>
            Workflow
            <select
              value={workflow}
              onChange={(e) => setWorkflow(e.target.value as RunRequest['workflow'])}
            >
              {WORKFLOWS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <p className="form-hint">{WORKFLOWS.find((item) => item.id === workflow)?.description}</p>
          {workflow === 'monte-carlo-pi' ? (
            <>
              <label>
                Samples
                <input
                  name="samples"
                  type="number"
                  min={1000}
                  max={2000000}
                  step={1}
                  required
                  defaultValue={
                    defaults?.workflow === 'monte-carlo-pi' ? defaults.parameters.samples : 100000
                  }
                />
              </label>
              <label>
                Random seed
                <input
                  name="seed"
                  type="number"
                  min={1}
                  max={2147483646}
                  step={1}
                  required
                  defaultValue={
                    defaults?.workflow === 'monte-carlo-pi' ? defaults.parameters.seed : 42
                  }
                />
              </label>
            </>
          ) : (
            <>
              <label>
                CSV input version
                <select
                  name="file"
                  required
                  defaultValue={defaults?.workflow === 'csv-summary' ? defaults.inputFileId : ''}
                >
                  <option value="" disabled>
                    Choose an uploaded CSV
                  </option>
                  {files
                    .filter((file) => file.name.toLowerCase().endsWith('.csv'))
                    .map((file) => (
                      <option key={file.id} value={file.id}>
                        {file.name} · {file.id.slice(0, 8)}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Numeric column name
                <input
                  name="column"
                  required
                  maxLength={128}
                  defaultValue={
                    defaults?.workflow === 'csv-summary' ? defaults.parameters.column : ''
                  }
                  placeholder="Exact column header, e.g. temperature"
                />
              </label>
              <p className="form-hint">
                Up to 100,000 rows. Blank/NA/null/NaN values are counted as missing. Other
                nonnumeric values fail validation. Preview the file to check headers.
              </p>
            </>
          )}
          <button className="button primary">
            Review configuration
            <ArrowRight size={16} />
          </button>
        </form>
      )}
    </Dialog>
  );
}

function RunDetail({
  run,
  aiEnabled,
  canWrite,
  onClose,
  onError,
  onRefresh,
  onClone,
}: {
  run: Run;
  aiEnabled: boolean;
  canWrite: boolean;
  onClose: () => void;
  onError: (message: string) => void;
  onRefresh: () => Promise<void>;
  onClone: () => void;
}) {
  const [analyses, setAnalyses] = useState<Analysis[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void api<Analysis[]>(`/runs/${run.id}/analyses`)
      .then((value) => {
        if (active) setAnalyses(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [run.id]);
  async function cancel() {
    try {
      await api(`/runs/${run.id}/cancel`, { method: 'POST' });
      await onRefresh();
    } catch (e) {
      onError((e as Error).message);
    }
  }
  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const question = String(new FormData(form).get('question'));
    setBusy(true);
    setError('');
    try {
      await api(`/runs/${run.id}/analyses`, { method: 'POST', body: json({ question }) });
      setAnalyses(await api<Analysis[]>(`/runs/${run.id}/analyses`));
      form.reset();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={workflowName(run.workflow)} wide onClose={onClose}>
      <div className="run-detail-head">
        <div>
          <Status status={run.status} />
          <code>{run.id}</code>
        </div>
        <div className="button-row">
          <a className="button secondary small-button" href={`/api/runs/${run.id}/manifest`}>
            <ArrowDownToLine size={14} />
            Export manifest
          </a>
          {canWrite && (
            <button className="button secondary small-button" onClick={onClone}>
              <Copy size={14} />
              Clone configuration
            </button>
          )}
          {canWrite && ['queued', 'running'].includes(run.status) && (
            <button
              className="button secondary danger-text small-button"
              onClick={() => void cancel()}
            >
              <Square size={13} />
              Cancel
            </button>
          )}
        </div>
      </div>
      <div className="run-timing">
        <span>
          <Clock3 size={14} />
          {formatDate(run.created_at)}
        </span>
        <span>Attempt {run.attempt}</span>
        <span>Workflow v1.0.0</span>
      </div>
      {run.error && (
        <p className="inline-error" role="alert">
          {run.error}
        </p>
      )}
      {run.result && (
        <>
          <p className="eyebrow">MEASURED OUTPUTS</p>
          <div className="metric-grid">
            {numericEntries(run.result).map(([name, value]) => (
              <div className="metric-card" key={name}>
                <small>{name.replaceAll('_', ' ')}</small>
                <strong>{pretty(value)}</strong>
              </div>
            ))}
          </div>
          <div className="notice">
            <Info size={16} />
            <span>
              {String(run.result.limitations)} Output schema checks passed; domain-specific
              scientific validity has not been established.
            </span>
          </div>
        </>
      )}
      <div className="detail-columns">
        <section>
          <h3>Execution parameters</h3>
          <pre className="file-preview">{JSON.stringify(run.parameters, null, 2)}</pre>
          {run.input_file_id && (
            <a className="text-link" href={`/api/files/${run.input_file_id}/download`}>
              Download pinned input
              <ArrowDownToLine size={14} />
            </a>
          )}
        </section>
        <section>
          <h3>Execution log</h3>
          <pre className="execution-log">
            {run.logs || 'Waiting for a worker to claim this run…'}
          </pre>
        </section>
      </div>
      <section className="analysis-section">
        <div className="section-heading">
          <div>
            <h3>
              <Sparkles size={17} />
              Ask the evidence
            </h3>
            <p>Explanations reference this run's recorded measurements.</p>
          </div>
          <span className="role-pill">{aiEnabled ? 'AI available' : 'AI not configured'}</span>
        </div>
        {!aiEnabled && (
          <p className="form-hint">
            An operator can enable server-side AI. Your results, downloads, and manifests are
            available independently.
          </p>
        )}
        {analyses.map((analysis) => (
          <article className="analysis-card" key={analysis.id}>
            <strong>{analysis.question}</strong>
            <p>{analysis.answer}</p>
            <details>
              <summary>Inspect evidence snapshot · {analysis.model}</summary>
              <pre className="file-preview">{JSON.stringify(analysis.evidence, null, 2)}</pre>
            </details>
          </article>
        ))}
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <form onSubmit={ask} className="ask-form">
          <input
            name="question"
            aria-label="Question about run evidence"
            minLength={3}
            maxLength={2000}
            required
            placeholder="What do these measurements tell us?"
            disabled={!aiEnabled || !canWrite || run.status !== 'succeeded' || busy}
          />
          <button
            className="button primary"
            disabled={!aiEnabled || !canWrite || run.status !== 'succeeded' || busy}
          >
            {busy ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={17} />}
            <span className="sr-only">Ask about results</span>
          </button>
        </form>
        <p className="form-hint">
          Using AI sends this run's parameters, metrics, artifact names/checksums, and your question
          to the configured provider. Inspect answers before using them in research.
        </p>
      </section>
    </Dialog>
  );
}

function Comparison({ runs }: { runs: Run[] }) {
  const [a, b] = runs;
  if (!a || !b) return <p>Select two completed runs.</p>;
  if (a.workflow !== b.workflow)
    return (
      <div className="notice">
        <Info size={18} />
        <p>
          These runs use different workflows. Their metrics are not directly comparable. Select runs
          from the same workflow.
        </p>
      </div>
    );
  const metrics = numericEntries(a.result);
  return (
    <>
      <p className="form-hint">
        Arithmetic differences describe these runs only. They do not establish statistical
        significance or causation. Input units must be checked independently.
      </p>
      {a.workflow === 'csv-summary' && a.parameters.column !== b.parameters.column && (
        <p className="inline-error">
          Different columns selected: verify units and meaning before interpreting differences.
        </p>
      )}
      <h3>Configuration</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Run {a.id.slice(0, 8)}</th>
              <th>Run {b.id.slice(0, 8)}</th>
            </tr>
          </thead>
          <tbody>
            {[...new Set([...Object.keys(a.parameters), ...Object.keys(b.parameters)])].map(
              (key) => (
                <tr key={key}>
                  <td>{key}</td>
                  <td>{pretty(a.parameters[key])}</td>
                  <td>{pretty(b.parameters[key])}</td>
                </tr>
              ),
            )}
            <tr>
              <td>Input version</td>
              <td>{a.input_file_id?.slice(0, 8) || 'None'}</td>
              <td>{b.input_file_id?.slice(0, 8) || 'None'}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h3>Measured difference</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              <th>Run A</th>
              <th>Run B</th>
              <th>B − A</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map(([key, value]) => {
              const other = b.result?.[key];
              return (
                <tr key={key}>
                  <td>{key.replaceAll('_', ' ')}</td>
                  <td>{pretty(value)}</td>
                  <td>{pretty(other)}</td>
                  <td>{typeof other === 'number' ? pretty(other - value) : 'Not comparable'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
