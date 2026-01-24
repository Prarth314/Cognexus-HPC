
import React, { useState, useMemo } from 'react';
import { Project, Document, TeamMember, AccessLevel } from '../types';
import { FileText, Send, BookOpen, Clock, Plus, Search, Terminal, Users, UserMinus, ShieldCheck, X, Crown, MoreVertical, Trash2, Settings2, Shield, Info, MessageSquare, CheckCircle, Upload, CheckSquare, Square, Play } from 'lucide-react';
import HPCPortal from './HPCPortal';
import AIAssistant from './AIAssistant';
import UserMenu from './UserMenu';

interface Props {
  project: Project;
  onBack: () => void;
  currentUserId: string;
  onUpdateProject: (p: Project) => void;
  userProjects: Project[];
  onLogout: () => void;
}

const ProjectWorkspace: React.FC<Props> = ({ project, onBack, currentUserId, onUpdateProject, userProjects, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'docs' | 'hpc' | 'ai'>('docs');
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  
  // Selection State
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [stagedDocsForHPC, setStagedDocsForHPC] = useState<Document[]>([]);
  
  // Invite form state
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('Researcher');

  const [documents, setDocuments] = useState<Document[]>([
    { id: 'd1', title: 'Preliminary Data Analysis v1', author: 'Me', type: 'Draft', status: 'Pending', updatedAt: '2 hours ago' },
    { id: 'd2', title: 'Q1 Forest Fire Report', author: 'Jane Doe', type: 'Publication', status: 'In Review', updatedAt: 'Yesterday' },
    { id: 'd3', title: 'Fluid Dynamics Peer Review', author: 'Dr. Smith', type: 'Review', status: 'Approved', updatedAt: '3 days ago' },
    { id: 'd4', title: 'Meteorological Dataset 2024', author: 'Admin', type: 'Draft', status: 'Approved', updatedAt: '5 days ago' }
  ]);

  const isOwner = project.ownerId === currentUserId;

  const toggleDocSelection = (id: string) => {
    setSelectedDocIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedDocIds.length === documents.length) {
      setSelectedDocIds([]);
    } else {
      setSelectedDocIds(documents.map(d => d.id));
    }
  };

  const handlePrepareSimulation = () => {
    const selected = documents.filter(d => selectedDocIds.includes(d.id));
    setStagedDocsForHPC(selected);
    setSelectedDocIds([]);
    setActiveTab('hpc');
  };

  const handleRemoveMember = (memberId: string) => {
    if (!isOwner) return;
    const updatedTeam = project.team.filter(m => m.id !== memberId);
    onUpdateProject({
      ...project,
      team: updatedTeam,
      members: updatedTeam.length + 1
    });
  };

  const handleInviteMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner || !inviteName.trim()) return;

    const newMember: TeamMember = {
      id: `m-${Math.random().toString(36).substr(2, 5)}`,
      name: inviteName,
      role: inviteRole,
      accessLevel: 'Collaborator'
    };

    const updatedTeam = [...project.team, newMember];
    onUpdateProject({
      ...project,
      team: updatedTeam,
      members: updatedTeam.length + 1
    });

    setInviteName('');
    setInviteRole('Researcher');
  };

  const handleChangeAccessLevel = (memberId: string, newLevel: AccessLevel) => {
    if (!isOwner) return;
    const updatedTeam = project.team.map(m => m.id === memberId ? { ...m, accessLevel: newLevel } : m);
    onUpdateProject({
      ...project,
      team: updatedTeam
    });
  };

  const handleDeleteDocument = (docId: string) => {
    if (!isOwner) return;
    if (confirm("Are you sure you want to delete this document permanently?")) {
      setDocuments(prev => prev.filter(d => d.id !== docId));
      setSelectedDocIds(prev => prev.filter(id => id !== docId));
    }
  };

  const handleApproveDocument = (docId: string) => {
    if (!isOwner) return;
    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, status: 'Approved' } : d));
  };

  const handleUploadSim = () => {
    if (!isOwner) return;
    const newDoc: Document = {
      id: `d-${Date.now()}`,
      title: 'New Uploaded Research Data',
      author: 'Me',
      type: 'Draft',
      status: 'Pending',
      updatedAt: 'Just now'
    };
    setDocuments(prev => [newDoc, ...prev]);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in relative min-h-screen">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <button onClick={onBack} className="text-sm text-blue-600 font-medium hover:underline mb-4 flex items-center">
            ← Back to Dashboard
          </button>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="flex items-center space-x-3 mb-1 text-black">
                <h1 className="text-3xl font-extrabold">{project.name}</h1>
                <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded">{project.type}</span>
                <span className="text-xs text-gray-400 font-mono">ID: {project.id}</span>
              </div>
              <p className="text-gray-500 max-w-2xl">{project.organization} • {project.description}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-4 pt-2">
          <div className="flex space-x-2 mr-2">
            <button 
              onClick={() => setIsManageModalOpen(true)}
              className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors flex items-center text-black"
            >
              <Users size={16} className="mr-2" />
              Team
            </button>
            <button 
              onClick={() => setIsSettingsModalOpen(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm flex items-center"
            >
              <Settings2 size={16} className="mr-2" />
              Settings
            </button>
          </div>
          
          <UserMenu 
            userProjects={userProjects}
            onLogout={onLogout}
            trigger={
              <div className="h-10 w-10 bg-blue-100 border border-blue-200 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm hover:bg-blue-200 transition-colors cursor-pointer shadow-sm">
                ME
              </div>
            }
          />
        </div>
      </div>

      <div className="flex border-b border-gray-200 mb-8 overflow-x-auto">
        <button
          onClick={() => setActiveTab('docs')}
          className={`pb-4 px-6 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap flex items-center ${
            activeTab === 'docs' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          <FileText size={18} className="mr-2" />
          Documents
        </button>
        <button
          onClick={() => setActiveTab('hpc')}
          className={`pb-4 px-6 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap flex items-center ${
            activeTab === 'hpc' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          <Terminal size={18} className="mr-2" />
          HPC Cluster
        </button>
        <button
          onClick={() => setActiveTab('ai')}
          className={`pb-4 px-6 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap flex items-center ${
            activeTab === 'ai' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          <MessageSquare size={18} className="mr-2" />
          AI Assistant
        </button>
      </div>

      {activeTab === 'docs' && (
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200 pb-24">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text" 
                placeholder="Search documents..." 
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none text-black bg-white"
              />
            </div>
            <div className="flex space-x-2 w-full sm:w-auto">
              <button 
                onClick={handleUploadSim}
                className="flex-1 sm:flex-none px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium flex items-center justify-center hover:bg-gray-50 text-black"
              >
                <Upload size={16} className="mr-2" /> Upload
              </button>
              <button className="flex-1 sm:flex-none px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold flex items-center justify-center hover:bg-blue-700">
                <Plus size={16} className="mr-2" /> New Draft
              </button>
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50/50">
                <tr>
                  <th className="px-6 py-4 text-left w-12">
                    <button onClick={toggleSelectAll} className="text-blue-600 hover:opacity-80 transition-opacity">
                      {selectedDocIds.length === documents.length ? <CheckSquare size={18} /> : <Square size={18} className="text-gray-300" />}
                    </button>
                  </th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Document</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Modified</th>
                  <th className="px-6 py-4 text-right text-[10px] font-bold text-gray-400 uppercase tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {documents.map(doc => {
                  const isSelected = selectedDocIds.includes(doc.id);
                  return (
                    <tr key={doc.id} className={`hover:bg-blue-50/20 transition-colors group ${isSelected ? 'bg-blue-50/40' : ''}`}>
                      <td className="px-6 py-4">
                        <button onClick={() => toggleDocSelection(doc.id)} className="text-blue-600 transition-all">
                          {isSelected ? <CheckSquare size={18} /> : <Square size={18} className="text-gray-300 group-hover:text-blue-200" />}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-black">
                        <div className="flex items-center">
                          <div className="p-2 bg-gray-100 text-gray-500 rounded-lg mr-3">
                            <BookOpen size={16} />
                          </div>
                          <div>
                            <div className="text-sm font-bold">{doc.title}</div>
                            <div className="text-xs text-gray-400">by {doc.author} • {doc.type}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className={`w-2 h-2 rounded-full mr-2 ${
                            doc.status === 'Approved' ? 'bg-green-500' : 
                            doc.status === 'In Review' ? 'bg-amber-500' : 'bg-gray-400'
                          }`} />
                          <span className="text-sm font-medium text-gray-700">{doc.status}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 flex items-center">
                        <Clock size={14} className="mr-1.5 opacity-40" /> {doc.updatedAt}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          {isOwner && doc.status !== 'Approved' && (
                            <button 
                              onClick={() => handleApproveDocument(doc.id)}
                              className="p-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
                              title="Approve Draft"
                            >
                              <CheckCircle size={16} />
                            </button>
                          )}
                          {isOwner && (
                            <button 
                              onClick={() => handleDeleteDocument(doc.id)}
                              className="p-1.5 bg-red-50 text-red-400 rounded-lg hover:bg-red-100 transition-colors"
                              title="Delete File"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                          <button className="text-blue-600 text-xs font-bold hover:underline">View</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Selection Sticky Bar */}
          {selectedDocIds.length > 0 && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-bottom-8 duration-300">
              <div className="glass bg-white/90 border border-blue-100 px-8 py-4 rounded-2xl shadow-2xl flex items-center space-x-8">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center font-black">
                    {selectedDocIds.length}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-gray-900">Documents Selected</div>
                    <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Ready for analysis</div>
                  </div>
                </div>
                <div className="h-8 w-[1px] bg-gray-200"></div>
                <div className="flex items-center space-x-2">
                  <button 
                    onClick={() => setSelectedDocIds([])}
                    className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-900 transition-colors"
                  >
                    Clear Selection
                  </button>
                  <button 
                    onClick={handlePrepareSimulation}
                    className="px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all flex items-center"
                  >
                    <Terminal size={16} className="mr-2" /> Use in Simulation
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'hpc' && (
        <div className="animate-in fade-in duration-300">
          <HPCPortal 
            projectName={project.name} 
            inputDocs={stagedDocsForHPC}
            onClearInput={() => setStagedDocsForHPC([])}
          />
        </div>
      )}
      
      {activeTab === 'ai' && <div className="animate-in fade-in duration-300"><AIAssistant projectDescription={project.description} /></div>}

      {/* Manage Team Modal */}
      {isManageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 text-black">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div>
                <h3 className="font-bold">Team Management</h3>
                <p className="text-xs text-gray-500">Add or remove researchers from this workspace.</p>
              </div>
              <button onClick={() => setIsManageModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6">
              {isOwner && (
                <form onSubmit={handleInviteMember} className="mb-8 p-4 bg-blue-50/50 border border-blue-100 rounded-xl">
                  <h4 className="text-xs font-bold text-blue-700 uppercase tracking-widest mb-3">Invite New Researcher</h4>
                  <div className="flex gap-3">
                    <input 
                      required
                      value={inviteName}
                      onChange={e => setInviteName(e.target.value)}
                      placeholder="Full Name" 
                      className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" 
                    />
                    <select 
                      value={inviteRole}
                      onChange={e => setInviteRole(e.target.value)}
                      className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none"
                    >
                      <option>Researcher</option>
                      <option>HPC Engineer</option>
                      <option>Data Scientist</option>
                      <option>External Auditor</option>
                    </select>
                    <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-blue-100">Invite</button>
                  </div>
                </form>
              )}

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-xl shadow-sm">
                  <div className="flex items-center">
                    <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold mr-3">ME</div>
                    <div>
                      <div className="text-sm font-bold flex items-center">You (Owner) <Crown size={14} className="ml-2 text-amber-500" /></div>
                      <div className="text-xs text-blue-600 font-medium uppercase tracking-tighter">Primary Researcher</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold bg-blue-100 text-blue-600 px-2 py-1 rounded">ROOT ACCESS</span>
                </div>

                <div className="max-h-[300px] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                  {project.team.map(member => (
                    <div key={member.id} className="flex items-center justify-between p-3 border border-gray-50 rounded-xl hover:bg-gray-50 transition-colors group">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center font-bold mr-3 border border-gray-200">{member.name.charAt(0)}</div>
                        <div>
                          <div className="text-sm font-bold text-gray-900">{member.name}</div>
                          <div className="text-xs text-gray-500">{member.role} • <span className="font-bold text-blue-600">{member.accessLevel}</span></div>
                        </div>
                      </div>
                      {isOwner && (
                        <button onClick={() => handleRemoveMember(member.id)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg hover:text-red-600 transition-all opacity-0 group-hover:opacity-100">
                          <UserMinus size={18} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button onClick={() => setIsManageModalOpen(false)} className="px-6 py-2 bg-white border border-gray-200 text-black font-bold rounded-xl hover:bg-gray-100 shadow-sm transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Project Settings Modal */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 text-black">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-blue-600 text-white shadow-lg">
              <div className="flex items-center">
                <Settings2 size={20} className="mr-2" />
                <h3 className="font-bold">Workspace Configuration</h3>
              </div>
              <button onClick={() => setIsSettingsModalOpen(false)} className="text-white/80 hover:text-white"><X size={20} /></button>
            </div>

            <div className="p-6">
              {!isOwner && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-100 rounded-xl flex items-start space-x-3">
                  <Info className="text-amber-600 shrink-0" size={18} />
                  <p className="text-xs text-amber-700 leading-relaxed">
                    You have <strong>Collaborator</strong> access. Most administrative settings are locked.
                  </p>
                </div>
              )}

              <div className="space-y-6">
                <section>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center">
                    <Shield size={14} className="mr-1.5" /> Access Control
                  </h4>
                  <div className="space-y-3">
                    {project.team.map(member => (
                      <div key={member.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-xs font-bold text-gray-500 mr-3">{member.name.charAt(0)}</div>
                          <div className="text-sm font-bold text-gray-900">{member.name}</div>
                        </div>
                        {isOwner ? (
                          <div className="flex bg-white rounded-lg border border-gray-200 p-1">
                            {(['Collaborator', 'Owner'] as AccessLevel[]).map(level => (
                              <button
                                key={level}
                                onClick={() => handleChangeAccessLevel(member.id, level)}
                                className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${
                                  member.accessLevel === level ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'
                                }`}
                              >
                                {level}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className={`px-3 py-1 rounded-lg text-[10px] font-bold ${member.accessLevel === 'Owner' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                            {member.accessLevel}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>

                <section className="pt-4 border-t border-gray-100">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center">
                    <FileText size={14} className="mr-1.5" /> Policy Management
                  </h4>
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-sm font-bold">Require Review for Publications</div>
                      <div className="w-10 h-6 bg-blue-600 rounded-full flex items-center px-1">
                        <div className="w-4 h-4 bg-white rounded-full translate-x-4"></div>
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-400 leading-tight">
                      When active, all "Publication" type documents must be approved by an Owner before being eligible for the public Nexus research feed.
                    </p>
                  </div>
                </section>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button 
                onClick={() => setIsSettingsModalOpen(false)} 
                className="px-6 py-2 bg-white border border-gray-200 text-black font-bold rounded-xl hover:bg-gray-100 shadow-sm transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectWorkspace;
