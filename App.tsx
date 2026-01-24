
import React, { useState } from 'react';
import { MOCK_PROJECTS } from './constants';
import { Project } from './types';
import { LayoutGrid, Globe, Plus, LogOut, Bell, Search, Settings } from 'lucide-react';
import ProjectCard from './components/ProjectCard';
import ProjectWorkspace from './components/ProjectWorkspace';

const App: React.FC = () => {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const selectedProject = MOCK_PROJECTS.find(p => p.id === selectedProjectId);

  const handleSelect = (id: string) => {
    setSelectedProjectId(id);
  };

  if (selectedProject) {
    return <ProjectWorkspace project={selectedProject} onBack={() => setSelectedProjectId(null)} />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navigation */}
      <nav className="glass sticky top-0 z-30 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-200">
                <Globe className="text-white" size={18} />
              </div>
              <span className="text-xl font-black text-gray-900 tracking-tight">NEXUS</span>
            </div>
            
            <div className="hidden md:flex flex-1 mx-8 max-w-md">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <input 
                  type="text" 
                  placeholder="Search projects, clusters, or users..." 
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-transparent rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none transition-all"
                />
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                <Bell size={20} />
              </button>
              <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                <Settings size={20} />
              </button>
              <div className="h-8 w-8 bg-gray-200 rounded-full border border-gray-300"></div>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="bg-white border-b border-gray-100 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight mb-2">Researcher Dashboard</h1>
              <p className="text-gray-500 text-lg">Manage your collaborations and High-Performance Compute simulations.</p>
            </div>
            <button className="flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-transform active:scale-95">
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
            My Active Projects
          </h2>
          <div className="flex items-center space-x-2 text-sm text-gray-400">
            <span>Sort by:</span>
            <select className="bg-transparent font-bold text-gray-600 focus:outline-none cursor-pointer">
              <option>Recently Viewed</option>
              <option>Alphabetical</option>
              <option>Type</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {MOCK_PROJECTS.map(project => (
            <ProjectCard 
              key={project.id} 
              project={project} 
              onSelect={handleSelect} 
            />
          ))}
          
          <button className="border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center justify-center group hover:border-blue-400 hover:bg-blue-50/30 transition-all">
            <div className="p-4 bg-gray-50 rounded-full text-gray-400 group-hover:text-blue-500 transition-colors mb-4">
              <Plus size={24} />
            </div>
            <span className="text-sm font-bold text-gray-500 group-hover:text-blue-600">Join Existing Project</span>
          </button>
        </div>

        {/* Quick Stats / Global Activity */}
        <section className="mt-16 bg-gray-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl">
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="max-w-md">
              <h2 className="text-2xl font-bold mb-3">Global Research Network</h2>
              <p className="text-gray-400 text-sm leading-relaxed">
                Nexus connects 2,400+ institutions worldwide. Access on-demand computing nodes across 4 continents and publish with confidence.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 w-full md:w-auto">
              <div className="text-center">
                <div className="text-3xl font-black text-blue-400">1.2 PetaFLOPS</div>
                <div className="text-[10px] uppercase font-bold text-gray-500 tracking-widest mt-1">Available Compute</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-black text-blue-400">421</div>
                <div className="text-[10px] uppercase font-bold text-gray-500 tracking-widest mt-1">Active Clusters</div>
              </div>
              <div className="text-center col-span-2 sm:col-span-1">
                <div className="text-3xl font-black text-blue-400">8.4k</div>
                <div className="text-[10px] uppercase font-bold text-gray-500 tracking-widest mt-1">Researchers Online</div>
              </div>
            </div>
          </div>
          {/* Decorative backgrounds */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl -ml-32 -mb-32"></div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-100 py-8 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center text-sm text-gray-400">
          <div className="flex items-center space-x-2 mb-4 md:mb-0">
            <div className="w-5 h-5 bg-gray-200 rounded flex items-center justify-center">
              <Globe size={12} className="text-gray-400" />
            </div>
            <span className="font-bold text-gray-500">NEXUS Research Platform</span>
          </div>
          <div className="flex space-x-8">
            <a href="#" className="hover:text-blue-600 transition-colors">Network Map</a>
            <a href="#" className="hover:text-blue-600 transition-colors">HPC Billing</a>
            <a href="#" className="hover:text-blue-600 transition-colors">Support</a>
            <a href="#" className="hover:text-blue-600 transition-colors">Documentation</a>
          </div>
          <button className="flex items-center text-xs font-bold mt-4 md:mt-0 px-3 py-1 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
            <LogOut size={14} className="mr-1.5" /> Sign Out
          </button>
        </div>
      </footer>
    </div>
  );
};

export default App;
