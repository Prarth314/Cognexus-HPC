
export type ProjectType = 'University' | 'Government' | 'Private';

export interface Project {
  id: string;
  name: string;
  type: ProjectType;
  organization: string;
  description: string;
  members: number;
  tags: string[];
}

export interface Document {
  id: string;
  title: string;
  author: string;
  type: 'Draft' | 'Publication' | 'Review';
  status: 'Pending' | 'Approved' | 'In Review';
  updatedAt: string;
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
}
