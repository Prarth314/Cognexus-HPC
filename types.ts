
export type ProjectType = 'University' | 'Government' | 'Private';
export type AccessLevel = 'Owner' | 'Collaborator';
export type NotificationType = 'Edit' | 'RoleChange' | 'StatusUpdate' | 'NewMember';

export interface TeamMember {
  id: string;
  name: string;
  role: string; // Descriptive title like "Lead Researcher"
  accessLevel: AccessLevel; // Permission role
  avatar?: string;
}

export interface Project {
  id: string;
  name: string;
  type: ProjectType;
  organization: string;
  description: string;
  members: number;
  team: TeamMember[];
  ownerId: string; // The primary creator/admin
  tags: string[];
  initialDocuments?: Document[];
  initialFiles?: ProjectFile[];
}

export interface Document {
  id: string;
  title: string;
  author: string;
  type: 'Draft' | 'Publication' | 'Review';
  status: 'Pending' | 'Approved' | 'In Review';
  updatedAt: string;
}

export interface ProjectFile {
  id: string;
  name: string;
  extension: string;
  size: string;
  source: 'User' | 'Simulation' | 'System';
  timestamp: string;
  category: 'Data' | 'Result' | 'Mesh' | 'Report';
}

export interface HPCCluster {
  id: string;
  name: string;
  location: string;
  lat: number;
  lng: number;
  nodes: number;
  status: 'Online' | 'Maintenance' | 'Full';
}

export interface SimulationResult {
  jobId: string;
  timestamp: string;
  logs: string;
  dataPoints: { x: number; y: number }[];
  summary?: string;
  gpuPerformance?: string;
  cost?: string;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  projectName: string;
  timestamp: string;
  isRead: boolean;
  author?: string;
}
