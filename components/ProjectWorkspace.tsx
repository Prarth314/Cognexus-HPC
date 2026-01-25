
import React, { useState, useMemo, useRef } from 'react';
import { Project, Document, TeamMember, AccessLevel, ProjectFile } from '../types';
import { FileText, BookOpen, Clock, Plus, Search, Terminal, Users, UserMinus, X, Crown, Trash2, Settings2, Shield, Info, CheckCircle, Upload, FileQuestion, FolderOpen, Download, Database, Image as ImageIcon, Eye, Printer, Share2, FileDown, FileSpreadsheet, FileBarChart, CheckSquare, Square } from 'lucide-react';
import HPCPortal from './HPCPortal';
import NotificationMenu from './NotificationMenu';
import UserMenu from './UserMenu';

interface Props {
  project: Project;
  onBack: () => void;
  currentUserId: string;
  onUpdateProject: (p: Project) => void;
}

const ProjectWorkspace: React.FC<Props> = ({ project, onBack, currentUserId, onUpdateProject }) => {
  const [activeTab, setActiveTab] = useState<'docs' | 'files' | 'hpc'>('docs');
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [previewFile, setPreviewFile] = useState<ProjectFile | null>(null);
  
  // Search State
  const [docSearchTerm, setDocSearchTerm] = useState('');
  const [fileSearchTerm, setFileSearchTerm] = useState('');
  
  // File Upload Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Selection State
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [stagedDocsForHPC, setStagedDocsForHPC] = useState<Document[]>([]);
  
  // Documents & Files state
  const [documents, setDocuments] = useState<Document[]>([
    { id: 'd1', title: 'Preliminary Data Analysis v1', author: 'Me', type: 'Draft', status: 'Pending', updatedAt: '2 hours ago' },
    { id: 'd2', title: 'Q1 Forest Fire Report', author: 'Jane Doe', type: 'Publication', status: 'In Review', updatedAt: 'Yesterday' },
    { id: 'd3', title: 'Fluid Dynamics Peer Review', author: 'Dr. Smith', type: 'Review', status: 'Approved', updatedAt: '3 days ago' },
    { id: 'd4', title: 'Meteorological Dataset 2024', author: 'Admin', type: 'Draft', status: 'Approved', updatedAt: '5 days ago' }
  ]);

  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([
    { id: 'f1', name: 'raw_sensor_data_2024', extension: 'csv', size: '124 MB', source: 'User', timestamp: '2 days ago', category: 'Data' },
    { id: 'f2', name: 'mesh_v1_topology', extension: 'json', size: '12 MB', source: 'System', timestamp: '1 week ago', category: 'Mesh' },
    { id: 'f3', name: 'aerodynamics_convergence_plot', extension: 'png', size: '1.2 MB', source: 'Simulation', timestamp: '3 days ago', category: 'Result' },
    { id: 'f4', name: 'q1_financial_impact', extension: 'xlsx', size: '4.5 MB', source: 'User', timestamp: '5 days ago', category: 'Report' }
  ]);
  
  // Invite form state
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('Researcher');

  // Derived Filtered Lists
  const filteredDocuments = useMemo(() => {
    return documents.filter(doc => 
      doc.title.toLowerCase().includes(docSearchTerm.toLowerCase()) ||
      doc.author.toLowerCase().includes(docSearchTerm.toLowerCase()) ||
      doc.type.toLowerCase().includes(docSearchTerm.toLowerCase())
    );
  }, [documents, docSearchTerm]);

  const filteredFiles = useMemo(() => {
    return projectFiles.filter(file => 
      file.name.toLowerCase().includes(fileSearchTerm.toLowerCase()) ||
      file.extension.toLowerCase().includes(fileSearchTerm.toLowerCase()) ||
      file.category.toLowerCase().includes(fileSearchTerm.toLowerCase())
    );
  }, [projectFiles, fileSearchTerm]);

  const isOwner = project.ownerId === currentUserId;

  const toggleDocSelection = (id: string) => {
    setSelectedDocIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedDocIds.length === filteredDocuments.length && filteredDocuments.length > 0) {
      setSelectedDocIds([]);
    } else {
      setSelectedDocIds(filteredDocuments.map(d => d.id));
    }
  };

  const handlePrepareSimulation = () => {
    const selected = documents.filter(d => selectedDocIds.includes(d.id));
    setStagedDocsForHPC(selected);
    setSelectedDocIds([]);
    setActiveTab('hpc');
  };

  const handleSimulationComplete = (newFile: ProjectFile) => {
    setProjectFiles(prev => [newFile, ...prev]);
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

  const handleDeleteFile = (fileId: string) => {
    if (!isOwner) return;
    if (confirm("Are you sure you want to delete this file from the project repository?")) {
      setProjectFiles(prev => prev.filter(f => f.id !== fileId));
    }
  };

  const handleApproveDocument = (docId: string) => {
    if (!isOwner) return;
    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, status: 'Approved' } : d));
  };

  const handleTriggerUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isDocLike = ['pdf', 'docx', 'doc', 'txt'].includes(file.name.split('.').pop()?.toLowerCase() || '');

    if (activeTab === 'docs' && isDocLike) {
      const newDoc: Document = {
        id: `d-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        title: file.name,
        author: 'Me',
        type: 'Draft',
        status: 'Pending',
        updatedAt: 'Just now'
      };
      setDocuments(prev => [newDoc, ...prev]);
    } else {
      const extension = file.name.split('.').pop() || 'bin';
      const newFile: ProjectFile = {
        id: `f-${Date.now()}`,
        name: file.name.replace(`.${extension}`, ''),
        extension,
        size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        source: 'User',
        timestamp: 'Just now',
        category: 'Data'
      };
      setProjectFiles(prev => [newFile, ...prev]);
      if (activeTab !== 'files') setActiveTab('files');
    }
    
    if (e.target) e.target.value = '';
  };

  const getFileIcon = (ext: string) => {
    switch (ext.toLowerCase()) {
      case 'xlsx': case 'xls': case 'csv': return <FileSpreadsheet className="text-emerald-600" size={18} />;
      case 'json': case 'xml': return <Terminal className="text-amber-600" size={18} />;
      case 'png': case 'jpg': case 'jpeg': return <FileBarChart className="text-purple-600" size={18} />;
      default: return <FileText className="text-blue-600" size={18} />;
    }
  };

  const renderFilePreviewContent = (file: ProjectFile) => {
    const ext = file.extension.toLowerCase();
    
    if (ext === 'csv' || ext === 'xlsx') {
      return (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100 text-black">
            <thead className="bg-gray-50">
              <tr>
                {['ID', 'Timestamp', 'Parameter_A', 'Parameter_B', 'Convergence'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2 text-xs text-gray-600 font-mono">#{1000 + i}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">2024-05-{10+i} 14:00:0{i}</td>
                  <td className="px-4 py-2 text-xs text-blue-600 font-bold">{(Math.random() * 10).toFixed(4)}</td>
                  <td className="px-4 py-2 text-xs text-gray-600">{(Math.random() * 100).toFixed(2)}%</td>
                  <td className="px-4 py-2 text-xs text-green-600 font-bold">1.42e-6</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-center">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Showing first 8 of 14,202 rows</p>
          </div>
        </div>
      );
    }

    if (ext === 'json' || ext === 'xml') {
      return (
        <div className="bg-gray-900 rounded-xl p-6 font-mono text-sm leading-relaxed overflow-x-auto shadow-inner border border-gray-800">
          <pre className="text-blue-300">
            {`{
  "project": "${project.name}",
  "version": "1.0.4-stable",
  "nodes": {
    "count": 128,
    "architecture": "x86_64",
    "accelerators": "NVIDIA A100"
  },
  "parameters": {
    "mesh_resolution": "high",
    "time_step": 0.001,
    "max_iterations": 50000,
    "boundary_conditions": "dynamic_atmospheric"
  },
  "status": "ready"
}`}
          </pre>
        </div>
      );
    }

    if (ext === 'png' || ext === 'jpg') {
      return (
        <div className="flex flex-col items-center">
          <div className="w-full aspect-video bg-gray-100 rounded-xl border border-dashed border-gray-300 flex flex-col items-center justify-center relative group overflow-hidden">
            <ImageIcon size={48} className="text-gray-300 mb-2 group-hover:scale-110 transition-transform" />
            <p className="text-sm font-bold text-gray-400">Simulation Render Preview</p>
            <p className="text-[10px] text-gray-300">Resolution: 1920x1080px</p>
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <p className="mt-4 text-xs text-gray-500 italic">Visual representation of the aerodynamic flow fields around the EV chassis at 120km/h.</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
        <Database size={48} className="text-gray-300 mb-4" />
        <h4 className="text-gray-900 font-bold">Binary Data View</h4>
        <p className="text-sm text-gray-500 mt-1">Direct visualization not supported for .{ext} extension.</p>
        <button className="mt-6 px-6 py-2 bg-white border border-gray-200 text-blue-600 font-bold rounded-xl hover:bg-blue-50 transition-colors shadow-sm flex items-center">
          <Download size={16} className="mr-2" /> Download to Local Storage
        </button>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in relative min-h-screen text-black">
      {/* Hidden File Input */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
        accept=".pdf,.docx,.txt,.csv,.xlsx,.json,.png,.jpg,.jpeg,.xml"
      />

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
              className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors flex items-center text-black shadow-sm active:scale-95"
            >
              <Users size={16} className="mr-2" />
              Team
            </button>
            {/* EXPLICIT Project Settings Button */}
            <button 
              id="project-settings-btn"
              onClick={() => setIsSettingsModalOpen(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 hover:shadow-md transition-all shadow-sm flex items-center active:scale-95"
            >
              <Settings2 size={16} className="mr-2" />
              Settings
            </button>
          </div>
          
          <div className="flex items-center space-x-2">
            <NotificationMenu />
            <UserMenu 
              userProjects={[]} 
              onLogout={() => window.location.reload()} 
              trigger={
                <div className="h-10 w-10 bg-blue-100 border border-blue-200 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm shadow-sm cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all">
                  ME
                </div>
              }
            />
          </div>
        </div>
      </div>

      <div className="flex border-b border-gray-200 mb-8 overflow-x-auto custom-scrollbar">
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
          onClick={() => setActiveTab('files')}
          className={`pb-4 px-6 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap flex items-center ${
            activeTab === 'files' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          <FolderOpen size={18} className="mr-2" />
          Files
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
      </div>

      {activeTab === 'docs' && (
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200 pb-24">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text" 
                value={docSearchTerm}
                onChange={(e) => setDocSearchTerm(e.target.value)}
                placeholder="Search documents by title, author, or type..." 
                className="w-full pl-10 pr-10 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none text-black bg-white"
              />
            </div>
            <div className="flex space-x-2 w-full sm:w-auto">
              <button 
                onClick={handleTriggerUpload}
                className="flex-1 sm:flex-none px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium flex items-center justify-center hover:bg-gray-50 text-black shadow-sm active:scale-95 transition-transform"
              >
                <Upload size={16} className="mr-2" /> Upload File
              </button>
              <button className="flex-1 sm:flex-none px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold flex items-center justify-center hover:bg-blue-700 shadow-md">
                <Plus size={16} className="mr-2" /> New Draft
              </button>
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            {filteredDocuments.length > 0 ? (
              <table className="min-w-full divide-y divide-gray-100 text-black">
                <thead className="bg-gray-50/50">
                  <tr>
                    <th className="px-6 py-4 text-left w-12">
                      <button onClick={toggleSelectAll} className="text-blue-600 hover:opacity-80 transition-opacity">
                        {selectedDocIds.length === filteredDocuments.length && filteredDocuments.length > 0 ? <CheckSquare size={18} /> : <Square size={18} className="text-gray-300" />}
                      </button>
                    </th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Document</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Modified</th>
                    <th className="px-6 py-4 text-right text-[10px] font-bold text-gray-400 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredDocuments.map(doc => {
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
                              <div className="text-sm font-bold truncate max-w-[200px]">{doc.title}</div>
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
                        <td className="px-6 py-4 text-sm text-gray-500 flex items-center whitespace-nowrap">
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
                            <button 
                              onClick={() => setPreviewDoc(doc)}
                              className="text-blue-600 text-xs font-bold hover:underline"
                            >
                              View
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="flex flex-col items-center justify-center py-24 px-6 text-center bg-gray-50/50">
                <FileQuestion size={32} className="text-gray-300 mb-4" />
                <h4 className="text-lg font-bold text-gray-900">No results found</h4>
              </div>
            )}
          </div>

          {/* Selection Sticky Bar */}
          {selectedDocIds.length > 0 && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-bottom-8 duration-300">
              <div className="glass bg-white/90 border border-blue-100 px-8 py-4 rounded-2xl shadow-2xl flex items-center space-x-8 text-black">
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

      {activeTab === 'files' && (
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200 pb-24">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
             <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text" 
                value={fileSearchTerm}
                onChange={(e) => setFileSearchTerm(e.target.value)}
                placeholder="Search by filename, extension..." 
                className="w-full pl-10 pr-10 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none text-black bg-white"
              />
            </div>
            <div className="flex space-x-2 w-full sm:w-auto">
              <button 
                onClick={handleTriggerUpload}
                className="flex-1 sm:flex-none px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium flex items-center justify-center hover:bg-gray-50 text-black shadow-sm"
              >
                <Plus size={16} className="mr-2" /> Add Data File
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredFiles.map(file => (
              <div key={file.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm hover:shadow-md transition-all group relative">
                <div className="flex items-start justify-between mb-3">
                  <div className="p-3 bg-gray-50 rounded-xl group-hover:bg-blue-50 transition-colors">
                    {getFileIcon(file.extension)}
                  </div>
                  <div className="flex items-center space-x-2">
                    <button 
                      onClick={() => setPreviewFile(file)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors" 
                      title="View File"
                    >
                      <Eye size={16} />
                    </button>
                    <button className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors" title="Download">
                      <Download size={14} />
                    </button>
                    {isOwner && (
                      <button 
                        onClick={() => handleDeleteFile(file.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
                
                <h5 className="text-sm font-bold text-gray-900 truncate mb-1" title={`${file.name}.${file.extension}`}>
                  {file.name}.{file.extension}
                </h5>
                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                      {file.size}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                      file.source === 'Simulation' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                      file.source === 'System' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                      'bg-green-50 text-green-600 border-green-100'
                    }`}>
                      {file.source}
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-400 font-medium">{file.timestamp}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'hpc' && (
        <div className="animate-in fade-in duration-300">
          <HPCPortal 
            projectName={project.name} 
            inputDocs={stagedDocsForHPC}
            onClearInput={() => setStagedDocsForHPC([])}
            onSimulationComplete={handleSimulationComplete}
          />
        </div>
      )}

      {/* Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-md animate-in fade-in duration-300 text-black">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            {/* Toolbar */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div className="flex items-center space-x-4">
                <div className="p-2 bg-blue-600 text-white rounded-lg">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 leading-tight">{previewDoc.title}</h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Nexus Internal Research Repository</p>
                </div>
              </div>
              <div className="flex items-center space-x-2 text-black">
                <button className="p-2 text-gray-400 hover:text-blue-600 hover:bg-white rounded-lg transition-all" title="Print">
                  <Printer size={18} />
                </button>
                <button className="p-2 text-gray-400 hover:text-blue-600 hover:bg-white rounded-lg transition-all" title="Share">
                  <Share2 size={18} />
                </button>
                <button className="p-2 text-gray-400 hover:text-blue-600 hover:bg-white rounded-lg transition-all" title="Download PDF">
                  <FileDown size={18} />
                </button>
                <div className="w-px h-6 bg-gray-200 mx-2" />
                <button onClick={() => setPreviewDoc(null)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto bg-gray-100/30 p-8 custom-scrollbar relative">
              <div className="max-w-3xl mx-auto bg-white shadow-xl min-h-full p-12 relative overflow-hidden text-black">
                {previewDoc.status !== 'Approved' && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] rotate-[-45deg] select-none text-black">
                    <span className="text-9xl font-black uppercase">{previewDoc.type}</span>
                  </div>
                )}
                <div className="border-b-2 border-gray-900 pb-8 mb-10 text-black">
                  <div className="flex justify-between items-start mb-6">
                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] border-b border-blue-600 pb-1">Nexus Report ID: {previewDoc.id}</span>
                    <div className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest ${
                      previewDoc.status === 'Approved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {previewDoc.status}
                    </div>
                  </div>
                  <h1 className="text-4xl font-extrabold text-gray-900 leading-tight mb-4">{previewDoc.title}</h1>
                  <div className="flex items-center text-sm text-gray-500 space-x-4">
                    <span className="flex items-center"><Users size={14} className="mr-1.5" /> {previewDoc.author}</span>
                    <span className="w-1 h-1 bg-gray-300 rounded-full" />
                    <span className="flex items-center"><Clock size={14} className="mr-1.5" /> {previewDoc.updatedAt}</span>
                    <span className="w-1 h-1 bg-gray-300 rounded-full" />
                    <span className="font-bold text-gray-700 uppercase tracking-tighter">{previewDoc.type}</span>
                  </div>
                </div>
                <div className="space-y-8 text-gray-800 leading-relaxed text-sm">
                  <section>
                    <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">I. Abstract</h2>
                    <p className="italic">
                      This research document outlines the primary observations and simulation results concerning {project.name}. 
                      The following analysis integrates High-Performance Computing (HPC) datasets with qualitative research benchmarks 
                      establish a baseline for upcoming simulation cycles.
                    </p>
                  </section>
                  <section>
                    <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">II. Methodology</h2>
                    <p>
                      Data was gathered using standard atmospheric sensors and secondary meteorological proxies. 
                      Initial mesh grids were constructed using Graph Neural Networks (GNNs) to optimize convergence rates 
                      within the virtual testing environment.
                    </p>
                  </section>
                  <div className="pt-12 mt-12 border-t border-gray-100 flex justify-between items-center text-[10px] text-gray-400 italic">
                    <span>Generated by Nexus Automated Archival System</span>
                    <span>CONFIDENTIAL - TEAM ACCESS ONLY</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end items-center space-x-3">
              <p className="text-xs text-gray-400 mr-auto">Viewing page 1 of 1</p>
              {isOwner && previewDoc.status !== 'Approved' && (
                <button 
                  onClick={() => {
                    handleApproveDocument(previewDoc.id);
                    setPreviewDoc(null);
                  }}
                  className="px-6 py-2 bg-green-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-green-100 flex items-center hover:bg-green-700 transition-all"
                >
                  <CheckCircle size={16} className="mr-2" /> Approve Publication
                </button>
              )}
              <button 
                onClick={() => setPreviewDoc(null)}
                className="px-6 py-2 bg-white border border-gray-200 text-black rounded-xl text-sm font-bold hover:bg-gray-100 transition-all shadow-sm"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/80 backdrop-blur-sm">
              <div className="flex items-center space-x-4">
                <div className={`p-2 rounded-lg ${
                  previewFile.category === 'Result' ? 'bg-purple-100 text-purple-600' :
                  previewFile.category === 'Data' ? 'bg-emerald-100 text-emerald-600' :
                  'bg-blue-100 text-blue-600'
                }`}>
                  {getFileIcon(previewFile.extension)}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-lg leading-none">{previewFile.name}.{previewFile.extension}</h3>
                </div>
              </div>
              <button onClick={() => setPreviewFile(null)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-gray-50/30">
              {renderFilePreviewContent(previewFile)}
            </div>
          </div>
        </div>
      )}

      {/* Manage Team Modal */}
      {isManageModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200 text-black">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 text-black">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div>
                <h3 className="font-bold">Team Management</h3>
              </div>
              <button onClick={() => setIsManageModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              {isOwner && (
                <form onSubmit={handleInviteMember} className="mb-8 p-4 bg-blue-50/50 border border-blue-100 rounded-xl text-black">
                  <h4 className="text-xs font-bold text-blue-700 uppercase tracking-widest mb-3 text-black">Invite Researcher</h4>
                  <div className="flex gap-3">
                    <input 
                      required
                      value={inviteName}
                      onChange={e => setInviteName(e.target.value)}
                      placeholder="Name" 
                      className="flex-1 px-3 py-2 border rounded-lg text-sm bg-white" 
                    />
                    <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold">Invite</button>
                  </div>
                </form>
              )}
              
              <div className="space-y-4 text-black">
                <div className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-xl shadow-sm text-black">
                  <div className="flex items-center text-black">
                    <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold mr-3">ME</div>
                    <div>
                      <div className="text-sm font-bold flex items-center text-black">You (Owner) <Crown size={14} className="ml-2 text-amber-500" /></div>
                      <div className="text-xs text-blue-600 font-medium uppercase tracking-tighter">Primary Researcher</div>
                    </div>
                  </div>
                </div>

                {project.team.map(member => (
                  <div key={member.id} className="flex items-center justify-between p-3 border border-gray-50 rounded-xl hover:bg-gray-50 transition-colors group text-black">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center font-bold mr-3 border border-gray-200">{member.name.charAt(0)}</div>
                      <div>
                        <div className="text-sm font-bold text-gray-900">{member.name}</div>
                        <div className="text-xs text-gray-500">{member.role}</div>
                      </div>
                    </div>
                    {isOwner && (
                      <button onClick={() => handleRemoveMember(member.id)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                        <UserMinus size={18} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EXPLICIT Project Settings Modal */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 text-black">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-blue-600 text-white shadow-lg">
              <div className="flex items-center">
                <Settings2 size={20} className="mr-2" />
                <h3 className="font-bold">Workspace Configuration</h3>
              </div>
              <button onClick={() => setIsSettingsModalOpen(false)} className="text-white/80 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 text-black">
              {!isOwner && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-100 rounded-xl flex items-start space-x-3 text-black">
                  <Info className="text-amber-600 shrink-0" size={18} />
                  <p className="text-xs text-amber-700 leading-relaxed text-black">
                    You have <strong>Collaborator</strong> access. Project administrative settings are managed by the owner.
                  </p>
                </div>
              )}

              <div className="space-y-6 text-black">
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
                      <div className={`w-10 h-6 rounded-full flex items-center px-1 transition-colors ${isOwner ? 'bg-blue-600 cursor-pointer shadow-inner' : 'bg-gray-300'}`}>
                        <div className={`w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${isOwner ? 'translate-x-4' : 'translate-x-0'}`}></div>
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-400 leading-tight">
                      When active, all "Publication" type documents must be approved by an Owner before being eligible for the public research feed.
                    </p>
                  </div>
                </section>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button 
                onClick={() => setIsSettingsModalOpen(false)} 
                className="px-8 py-2 bg-white border border-gray-200 text-black font-bold rounded-xl hover:bg-gray-100 shadow-sm transition-colors active:scale-95"
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
