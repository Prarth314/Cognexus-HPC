
import React from 'react';
import { Project } from '../types';
import { Users, Building2, GraduationCap, ShieldCheck, ArrowRight } from 'lucide-react';

interface Props {
  project: Project;
  onSelect: (id: string) => void;
}

const ProjectCard: React.FC<Props> = ({ project, onSelect }) => {
  const Icon = project.type === 'University' ? GraduationCap : project.type === 'Government' ? ShieldCheck : Building2;
  const color = project.type === 'University' ? 'text-blue-600 bg-blue-50' : project.type === 'Government' ? 'text-emerald-600 bg-emerald-50' : 'text-purple-600 bg-purple-50';

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer flex flex-col h-full group"
         onClick={() => onSelect(project.id)}>
      <div className="flex items-center justify-between mb-4">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon size={20} />
        </div>
        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
          {project.type}
        </span>
      </div>
      
      <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
        {project.name}
      </h3>
      <p className="text-sm text-gray-500 mt-1 mb-4 line-clamp-2">
        {project.description}
      </p>

      <div className="mt-auto pt-4 border-t border-gray-50 flex items-center justify-between">
        <div className="flex items-center text-gray-400 text-xs">
          <Users size={14} className="mr-1" />
          {project.members} Collaborators
        </div>
        <div className="text-blue-600 text-xs font-medium flex items-center">
          Open Project <ArrowRight size={14} className="ml-1" />
        </div>
      </div>
    </div>
  );
};

export default ProjectCard;
