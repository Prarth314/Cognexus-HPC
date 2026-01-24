
import React, { useState } from 'react';
import { Project, Document } from '../types';
import { FileText, Send, BookOpen, Clock, Plus, Search, Terminal } from 'lucide-react';
import HPCPortal from './HPCPortal';

interface Props {
  project: Project;
  onBack: () => void;
}

const ProjectWorkspace: React.FC<Props> = ({ project, onBack }) => {
  const [activeTab, setActiveTab] = useState<'docs' | 'hpc'>('docs');
  const [documents] = useState<Document[]>([
    { id: 'd1', title: 'Preliminary Data Analysis v1', author: 'Me', type: 'Draft', status: 'Pending', updatedAt: '2 hours ago' },
    { id: 'd2', title: 'Q1 Forest Fire Report', author: 'Jane Doe', type: 'Publication', status: 'In Review', updatedAt: 'Yesterday' },
    { id: 'd3', title: 'Fluid Dynamics Peer Review', author: 'Dr. Smith', type: 'Review', status: 'Approved', updatedAt: '3 days ago' }
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in">
      <div className="mb-8">
        <button onClick={onBack} className="text-sm text-blue-600 font-medium hover:underline mb-4 flex items-center">
          ← Back to Dashboard
        </button>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center space-x-3 mb-1">
              <h1 className="text-3xl font-extrabold text-gray-900">{project.name}</h1>
              <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded">{project.type}</span>
            </div>
            <p className="text-gray-500 max-w-2xl">{project.organization} • {project.description}</p>
          </div>
          <div className="flex space-x-2">
            <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors">
              Manage Team
            </button>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm">
              Project Settings
            </button>
          </div>
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
          Documents & Publications
        </button>
        <button
          onClick={() => setActiveTab('hpc')}
          className={`pb-4 px-6 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap flex items-center ${
            activeTab === 'hpc' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          <Terminal size={18} className="mr-2" />
          HPC Simulation Cluster
        </button>
      </div>

      {activeTab === 'docs' ? (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text" 
                placeholder="Search documents..." 
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex space-x-2 w-full sm:w-auto">
              <button className="flex-1 sm:flex-none px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium flex items-center justify-center hover:bg-gray-50">
                <Send size={16} className="mr-2" /> Publication Request
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
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Document</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Type</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Modified</th>
                  <th className="px-6 py-4 text-right text-[10px] font-bold text-gray-400 uppercase tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {documents.map(doc => (
                  <tr key={doc.id} className="hover:bg-blue-50/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="p-2 bg-gray-100 text-gray-500 rounded-lg mr-3">
                          <BookOpen size={16} />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-900">{doc.title}</div>
                          <div className="text-xs text-gray-400">by {doc.author}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                        {doc.type}
                      </span>
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
                      <Clock size={14} className="mr-1.5 opacity-40" />
                      {doc.updatedAt}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="text-blue-600 text-xs font-bold hover:underline">View File</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <HPCPortal projectName={project.name} />
      )}
    </div>
  );
};

export default ProjectWorkspace;
