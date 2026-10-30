import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, Check, ChevronRight, Command, FlaskConical, FolderOpen, Github, Layers3, LoaderCircle, LogOut, Plus, Search, ShieldCheck, Sparkles, X } from 'lucide-react';
import type { Project, User } from '../shared/contracts';
import { api,json } from './api';
import { Dialog } from './Dialog';
import { Workspace } from './Workspace';
import './styles.css';

type Session={ user:User|null; registrationRestricted:boolean; aiEnabled:boolean; execution:string };
function Logo({ compact=false }: { compact?:boolean }) {
  return <span className="brand"><span className="brand-mark"><Layers3 size={22} strokeWidth={1.8}/></span>{!compact&&<span>cognexus<span className="brand-period">.</span></span>}</span>;
}
export default function App() {
  const [session,setSession]=useState<Session|null>(null);
  const [projects,setProjects]=useState<Project[]>([]);
  const [selected,setSelected]=useState<string|null>(null);
  const [error,setError]=useState('');
  const [query,setQuery]=useState('');
  const [creating,setCreating]=useState(false);
  const [joining,setJoining]=useState(false);
  const [working,setWorking]=useState(false);
  const [refreshing,setRefreshing]=useState(true);
  async function reload() { setProjects(await api<Project[]>('/projects')); }
  useEffect(()=>{ let active=true; void api<Session>('/session').then(value=>{ if(active)setSession(value); }).catch(e=>{ if(active)setError(String(e.message)); }); return ()=>{active=false;}; },[]);
  useEffect(()=>{ if(session?.user) { setRefreshing(true); void reload().catch(e=>setError(e.message)).finally(()=>setRefreshing(false)); } },[session?.user?.id]);
  async function logout() { try { await api('/auth/logout',{ method:'POST' });setSession(previous=>previous?{...previous,user:null}:null);setSelected(null);setProjects([]); } catch(e){setError((e as Error).message);} }
  async function createProject(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setWorking(true);setError('');
    const data=new FormData(event.currentTarget);
    try { const response=await api<{id:string}>('/projects',{ method:'POST',body:json({ name:data.get('name'),description:data.get('description'),domain:data.get('domain') }) });await reload();setCreating(false);setSelected(response.id); }
    catch(e){setError((e as Error).message);} finally{setWorking(false);}
  }
  async function join(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setWorking(true);setError('');const data=new FormData(event.currentTarget);
    try { const response=await api<{projectId:string}>('/invitations/accept',{ method:'POST',body:json({ token:data.get('token') }) });await reload();setJoining(false);setSelected(response.projectId); }
    catch(e){setError((e as Error).message);} finally{setWorking(false);}
  }
  const project=projects.find(item=>item.id===selected);
  if(!session) return <main className="loading-page"><Logo/><p role="status">{error||'Preparing your workspace…'}</p>{error&&<button onClick={()=>location.reload()}>Try again</button>}</main>;
  if(!session.user) return <Auth session={session} onSession={user=>setSession({...session,user})}/>;
  const filtered=projects.filter(item=>`${item.name} ${item.description} ${item.domain}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className="sidebar"><button className="brand-button" onClick={()=>setSelected(null)} aria-label="Cognexus home"><Logo/></button>
      <div className="workspace-label"><span className="avatar small">{session.user.name[0]}</span><span>Research workspace<small>Personal workspace</small></span><ChevronRight size={15}/></div>
      <p className="nav-label">WORKSPACE</p>
      <button className={`nav-item ${!project?'active':''}`} onClick={()=>setSelected(null)}><FolderOpen size={18}/>Overview<span className="nav-count">{projects.length}</span></button>
      <button className="nav-item" onClick={()=>setCreating(true)}><Plus size={18}/>New project</button>
      <button className="nav-item" onClick={()=>setJoining(true)}><ShieldCheck size={18}/>Accept invitation</button>
      <div className="sidebar-projects"><p className="nav-label">YOUR PROJECTS</p>{projects.slice(0,8).map(item=><button key={item.id} className={`nav-project ${selected===item.id?'selected':''}`} onClick={()=>setSelected(item.id)}><span className="project-dot"/>{item.name}</button>)}</div>
      <div className="sidebar-bottom"><div className="execution-note"><span className="live-dot"/>Local CPU execution<small>Real workloads · bounded resources</small></div><a className="nav-item" href="https://github.com/Prarth314/Cognexus-HPC" target="_blank" rel="noreferrer"><Github size={17}/>Source & documentation<ArrowUpRight size={14}/></a><button className="user-button" aria-label={`Sign out ${session.user.name}`} onClick={logout}><span className="avatar">{session.user.name[0]}</span><span>{session.user.name}<small>Sign out of your account</small></span><LogOut size={16}/></button></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb"><span>Workspace</span><ChevronRight size={13}/><strong>{project?.name||'Overview'}</strong></div><div className="topbar-right"><button className="mobile-join icon-button" aria-label="Accept invitation" onClick={()=>setJoining(true)}><ShieldCheck size={16}/></button><span className="environment"><span className="live-dot"/>Research preview</span><span className="avatar small">{session.user.name[0]}</span></div></header>
      {error&&<div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={()=>setError('')}><X size={16}/></button></div>}
      <main id="main-content">{project?<Workspace key={project.id} project={project} user={session.user} aiEnabled={session.aiEnabled} onError={setError} onRefresh={reload}/>:<div className="overview page-enter">
        <div className="page-heading"><div><p className="eyebrow">A PLACE FOR WHAT'S NEXT</p><h1>Your next discovery<br/>starts here<span className="teal-text">.</span></h1><p className="subtitle">Bring your people, experiments, and evidence together.</p></div><button className="button primary" onClick={()=>setCreating(true)}><Plus size={17}/>Create a project</button></div>
        <section className="hero-panel"><div className="hero-copy"><span className="hero-tag"><Sparkles size={13}/>BUILT FOR CURIOUS MINDS</span><h2>Less friction.<br/>More discovery.</h2><p>From the first dataset to a reproducible result.<br/>Give every experiment a place to grow.</p><button className="button light" onClick={()=>setCreating(true)}>Start an experiment<ArrowUpRight size={17}/></button></div><div className="orbit-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orbit orbit-three"/><div className="orbit-core"><FlaskConical size={44} strokeWidth={1.25}/></div><div className="orbit-tag tag-top"><Check size={13}/>Inputs verified</div><div className="orbit-tag tag-bottom"><Layers3 size={13}/>Evidence connected</div><span className="star star-one">✦</span><span className="star star-two">✦</span></div></section>
        <section className="overview-stats" aria-label="Workspace summary"><div><span className="stat-icon"><FolderOpen size={20}/></span><div><small>Research projects</small><strong>{projects.length.toString().padStart(2,'0')}</strong></div></div><div><span className="stat-icon violet"><ShieldCheck size={20}/></span><div><small>Projects you own</small><strong>{projects.filter(p=>p.role==='owner').length.toString().padStart(2,'0')}</strong></div></div><div><span className="stat-icon amber"><Command size={20}/></span><div><small>Available workflows</small><strong>02</strong></div></div></section>
        <div className="section-heading"><div><h2>Your projects <span className="count-pill">{projects.length}</span></h2><p>Ideas in motion. Evidence in one place.</p></div><label className="search-field"><Search size={16}/><input aria-label="Search projects" placeholder="Find a project…" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
        {refreshing?<div className="empty-state"><LoaderCircle className="spin"/>Loading your projects…</div>:<div className="project-grid">{filtered.map((item,index)=><button className="project-card" key={item.id} onClick={()=>setSelected(item.id)}><div className="card-top"><span className={`project-icon color-${index%3}`}><FlaskConical size={22}/></span><span className="role-pill">{item.role}</span></div><span className="card-domain">{item.domain}</span><h3>{item.name}</h3><p>{item.description||'A new space for questions, experiments, and discoveries.'}</p><div className="card-footer"><span><span className="tiny-avatars">{item.members>1?'◉ ◉':'◉'}</span>{item.members} {item.members===1?'member':'members'}</span><ArrowUpRight size={19}/></div></button>)}<button className="project-card new-project" onClick={()=>setCreating(true)}><span className="new-project-plus"><Plus size={24}/></span><h3>Make room for an idea</h3><p>Create a project and start exploring.</p><span className="text-link">New project<ArrowRight size={15}/></span></button></div>}
        <footer className="page-footer"><span><ShieldCheck size={14}/>Private projects. Traceable experiments.</span><span>Cognexus · Research, connected.</span></footer>
      </div>}</main>
    </div>
    {creating&&<Dialog title="A new space for discovery" onClose={()=>setCreating(false)}><form onSubmit={createProject} className="form-stack"><label>Project name<input name="name" autoFocus required minLength={2} maxLength={120} placeholder="e.g. Coastal sensor analysis"/></label><label>Research area<input name="domain" maxLength={80} defaultValue="Computational research" required/></label><label>What are you investigating?<textarea name="description" maxLength={2000} rows={3} placeholder="A question worth exploring…"/></label><p className="form-hint">You will own this project. Invite collaborators after creating it.</p><button disabled={working} className="button primary">{working?'Creating…':'Create project'}<ArrowRight size={16}/></button>{error&&<p className="inline-error" role="alert">{error}</p>}</form></Dialog>}
    {joining&&<Dialog title="Join a research project" onClose={()=>setJoining(false)}><form onSubmit={join} className="form-stack"><p>Paste the private invitation code shared by a project owner. It must be addressed to your account email.</p><label>Invitation code<input name="token" autoFocus required pattern="[a-f0-9]{64}" maxLength={64}/></label><button className="button primary" disabled={working}>{working?'Joining…':'Accept invitation'}<ArrowRight size={16}/></button>{error&&<p className="inline-error" role="alert">{error}</p>}</form></Dialog>}
  </div>;
}

function Auth({ session,onSession }: { session:Session;onSession:(user:User)=>void }) {
  const [register,setRegister]=useState(false),[error,setError]=useState(''),[working,setWorking]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setWorking(true);setError('');const data=new FormData(event.currentTarget);
    try { const response=await api<{user:User}>(`/auth/${register?'register':'login'}`,{ method:'POST',body:json({ name:data.get('name'),email:data.get('email'),password:data.get('password'),signupCode:data.get('signupCode')||undefined }) });onSession(response.user); }
    catch(e){setError((e as Error).message);} finally{setWorking(false);}
  }
  return <main className="auth-page"><section className="auth-story"><Logo/><div><p className="eyebrow">RESEARCH, CONNECTED</p><h1>Big questions.<br/>Connected minds.<br/><span>Real evidence.</span></h1><p>A thoughtful workspace for experiments<br/>you can understand, share, and reproduce.</p><div className="auth-principles"><span><ShieldCheck size={17}/>Private by design</span><span><Layers3 size={17}/>Traceable by default</span></div></div><small>Built by researchers, for the work ahead.</small></section><section className="auth-form-side"><div className="auth-form"><span className="mobile-brand"><Logo/></span><span className="auth-icon"><FlaskConical size={26}/></span><h2>{register?'Make space for discovery.':'Welcome back.'}</h2><p>{register?'Create your research account.':'Sign in to pick up where your curiosity left off.'}</p><form onSubmit={submit} className="form-stack">{register&&<label>Your name<input name="name" required minLength={2} maxLength={100} autoComplete="name"/></label>}<label>Email address<input name="email" type="email" required autoComplete="email"/></label><label>Password<input name="password" type="password" required minLength={register?12:1} maxLength={128} autoComplete={register?'new-password':'current-password'}/></label>{register&&<p className="form-hint">Use at least 12 characters. This preview uses operator-managed accounts; password recovery is not yet available.</p>}{register&&session.registrationRestricted&&<label>Operator access code<input name="signupCode" type="password" required autoComplete="off"/></label>}{error&&<p className="inline-error" role="alert">{error}</p>}<button className="button primary" disabled={working}>{working?<LoaderCircle className="spin" size={17}/>:<>{register?'Create account':'Sign in'}<ArrowRight size={17}/></>}</button></form><p className="auth-switch">{register?'Already have an account?':'New to Cognexus?'} <button onClick={()=>{setRegister(!register);setError('');}}>{register?'Sign in':'Create an account'}</button></p><div className="auth-status"><span className="live-dot"/>Real local compute · Research preview</div></div></section></main>;
}
