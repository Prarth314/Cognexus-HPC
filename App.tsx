
import React, { useState, useMemo } from 'react';
import { ALL_PROJECTS, INITIAL_PROJECT_IDS, MOCK_NOTIFICATIONS } from './constants';
import { Project, ProjectType, Notification } from './types';
import { LayoutGrid, Globe, Plus, Bell, Search, X, Info, FolderSearch } from 'lucide-react';
import ProjectCard from './components/ProjectCard';
import ProjectWorkspace from './components/ProjectWorkspace';
import NotificationMenu from './components/NotificationMenu';
import UserMenu from './components/UserMenu';

const CURRENT_USER_ID = 'me';

const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>(ALL_PROJECTS);
  const [userProjectIds, setUserProjectIds] = useState<string[]>(INITIAL_PROJECT_IDS);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectSearchTerm, setProjectSearchTerm] = useState('');
  
  // Persistent Notifications State
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);
  
  // Modals
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  
  // Create Form State
  const [newName, setNewName] = useState('');
  const [newOrg, setNewOrg] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newType, setNewType] = useState<ProjectType>('University');

  // Join Form State
  const [joinInput, setJoinInput] = useState('');
  const [joinStatus, setJoinStatus] = useState<'idle' | 'error' | 'success'>('idle');

  const userProjects = useMemo(() => {
    return projects
      .filter(p => userProjectIds.includes(p.id))
      .filter(p => 
        p.name.toLowerCase().includes(projectSearchTerm.toLowerCase()) ||
        p.organization.toLowerCase().includes(projectSearchTerm.toLowerCase()) ||
        p.description.toLowerCase().includes(projectSearchTerm.toLowerCase())
      );
  }, [projects, userProjectIds, projectSearchTerm]);

  const selectedProject = useMemo(() => projects.find(p => p.id === selectedProjectId), [projects, selectedProjectId]);

  const handleSelect = (id: string) => {
    setSelectedProjectId(id);
  };

  const handleUpdateProject = (updated: Project) => {
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
  };

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    const newId = `proj-${Math.random().toString(36).substr(2, 9)}`;
    const newProject: Project = {
      id: newId,
      name: newName,
      type: newType,
      organization: newOrg,
      description: newDesc,
      members: 1,
      ownerId: CURRENT_USER_ID,
      team: [
        { id: 'm-guest-1', name: 'Reviewer Bot', role: 'Audit Log', accessLevel: 'Collaborator' },
        { id: 'm-guest-2', name: 'External Contributor', role: 'Collaborator', accessLevel: 'Collaborator' }
      ],
      tags: ['New']
    };

    setProjects(prev => [...prev, newProject]);
    setUserProjectIds(prev => [...prev, newId]);
    setIsCreateModalOpen(false);
    
    setNewName('');
    setNewOrg('');
    setNewDesc('');
    setNewType('University');
    
    setSelectedProjectId(newId);
  };

  const handleJoinProject = (e: React.FormEvent) => {
    e.preventDefault();
    const foundProject = projects.find(p => p.id.toLowerCase() === joinInput.toLowerCase());
    
    if (!foundProject) {
      setJoinStatus('error');
      return;
    }

    if (userProjectIds.includes(foundProject.id)) {
      setJoinStatus('success');
      setTimeout(() => setIsJoinModalOpen(false), 1000);
      return;
    }

    setUserProjectIds(prev => [...prev, foundProject.id]);
    setJoinStatus('success');
    setTimeout(() => {
      setIsJoinModalOpen(false);
      setJoinStatus('idle');
      setJoinInput('');
    }, 1500);
  };

  if (selectedProject) {
    return (
      <ProjectWorkspace 
        project={selectedProject} 
        onBack={() => setSelectedProjectId(null)} 
        currentUserId={CURRENT_USER_ID}
        onUpdateProject={handleUpdateProject}
        notifications={notifications}
        onUpdateNotifications={setNotifications}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f9fafb]">
      {/* Navigation */}
      <nav className="glass sticky top-0 z-30 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-200">
                <Globe className="text-white" size={18} />
              </div>
              <span className="text-xl font-black text-gray-900 tracking-tight">COGNEXUS</span>
            </div>
            
            <div className="hidden md:flex flex-1 mx-8 max-w-md">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <input 
                  type="text" 
                  value={projectSearchTerm}
                  onChange={(e) => setProjectSearchTerm(e.target.value)}
                  placeholder="Search projects..." 
                  className="w-full pl-10 pr-10 py-2 bg-gray-50 border border-transparent rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none transition-all text-black font-medium"
                />
                {projectSearchTerm && (
                  <button 
                    onClick={() => setProjectSearchTerm('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <NotificationMenu 
                notifications={notifications} 
                onUpdateNotifications={setNotifications} 
              />
              <UserMenu 
                userProjects={userProjects} 
                onLogout={() => window.location.reload()} 
                trigger={
                  <div className="h-8 w-8 bg-blue-100 border border-blue-200 rounded-full flex items-center justify-center text-blue-600 font-bold text-xs hover:ring-2 hover:ring-blue-500 transition-all">
                    ME
                  </div>
                } 
              />
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="bg-white border-b border-gray-100 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight mb-2 text-black">Researcher Dashboard</h1>
              <p className="text-gray-500 text-lg">Manage your collaborations and High-Performance Compute simulations.</p>
            </div>
            <button 
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-transform active:scale-95"
            >
              <Plus size={20} className="mr-2" /> Start New Project
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl font-bold text-gray-900 flex items-center">
            <LayoutGrid className="mr-2 text-blue-600" size={20} />
            {projectSearchTerm ? `Search Results for "${projectSearchTerm}"` : 'My Active Projects'}
          </h2>
        </div>

        {userProjects.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {userProjects.map(project => (
              <ProjectCard 
                key={project.id} 
                project={project} 
                onSelect={handleSelect} 
              />
            ))}
            
            {!projectSearchTerm && (
              <button 
                onClick={() => {
                  setJoinStatus('idle');
                  setJoinInput('');
                  setIsJoinModalOpen(true);
                }}
                className="border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center justify-center group hover:border-blue-400 hover:bg-blue-50/30 transition-all text-black bg-white"
              >
                <div className="p-4 bg-gray-50 rounded-full text-gray-400 group-hover:text-blue-500 transition-colors mb-4">
                  <Plus size={24} />
                </div>
                <span className="text-sm font-bold group-hover:text-blue-600">Join Existing Project</span>
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center bg-white border border-dashed border-gray-200 rounded-3xl">
            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-300 mb-4">
              <FolderSearch size={32} />
            </div>
            <h3 className="text-lg font-bold text-gray-900">No matching projects</h3>
            <p className="text-sm text-gray-500 max-w-xs mx-auto mt-2">
              We couldn't find any of your active projects matching "{projectSearchTerm}".
            </p>
            <button 
              onClick={() => setProjectSearchTerm('')}
              className="mt-6 px-4 py-2 text-sm font-bold text-blue-600 hover:text-blue-800"
            >
              Clear search filter
            </button>
          </div>
        )}
      </main>

      {/* Join Project Modal */}
      {isJoinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 text-black">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Join a Project</h3>
              <button onClick={() => setIsJoinModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleJoinProject} className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Project ID</label>
                  <input 
                    autoFocus
                    type="text"
                    value={joinInput}
                    onChange={(e) => {
                      setJoinInput(e.target.value);
                      if (joinStatus !== 'idle') setJoinStatus('idle');
                    }}
                    placeholder="e.g. p-secret-42"
                    className={`w-full px-4 py-3 rounded-xl border-2 transition-all outline-none text-sm font-medium ${
                      joinStatus === 'error' ? 'border-red-100 bg-red-50 text-red-900' :
                      joinStatus === 'success' ? 'border-green-100 bg-green-50 text-green-900' :
                      'border-gray-100 bg-gray-50 focus:border-blue-500 focus:bg-white text-black'
                    }`}
                  />
                </div>
                {joinStatus === 'error' && <div className="text-red-600 text-xs font-medium">Invalid Project ID.</div>}
                <button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-100">Request Access</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Project Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 text-black">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center">
                <Plus size={18} className="mr-2 text-blue-600" /> Start New Research Project
              </h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateProject} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Project Name</label>
                  <input required value={newName} onChange={e => setNewName(e.target.value)} type="text" placeholder="Quantum Mesh V2" className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none text-black" />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Organization</label>
                  <input required value={newOrg} onChange={e => setNewOrg(e.target.value)} type="text" placeholder="MIT Labs" className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none text-black" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Project Category</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['University', 'Government', 'Private'] as ProjectType[]).map(t => (
                    <button 
                      key={t}
                      type="button"
                      onClick={() => setNewType(t)}
                      className={`py-2 px-3 rounded-lg text-xs font-bold border-2 transition-all ${
                        newType === t ? 'bg-blue-50 border-blue-500 text-blue-600' : 'bg-gray-50 border-transparent text-gray-500 hover:bg-gray-100'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Brief Description</label>
                <textarea required value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={3} placeholder="Describe your research objectives..." className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none text-black" />
              </div>

              <div className="p-4 bg-amber-50 rounded-xl flex items-start space-x-3">
                <Info size={18} className="text-amber-600 mt-0.5" />
                <p className="text-xs text-amber-700 leading-relaxed">
                  As the project creator, you will be assigned <strong>Owner</strong> status. You can manage team members, approve publication drafts, and control HPC resource allocation.
                </p>
              </div>

              <div className="flex space-x-3 pt-4">
                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="flex-1 py-3 border border-gray-200 text-black rounded-xl font-bold hover:bg-gray-50 transition-colors">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-colors">Create Workspace</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
