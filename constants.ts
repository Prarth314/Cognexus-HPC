
import { Project, HPCCluster, TeamMember } from './types';

const MOCK_TEAM: TeamMember[] = [
  { id: 'm1', name: 'Dr. Aris Thorne', role: 'Lead Researcher', accessLevel: 'Collaborator' },
  { id: 'm2', name: 'Sarah Jenkins', role: 'Data Scientist', accessLevel: 'Collaborator' },
  { id: 'm3', name: 'Alex Rivera', role: 'HPC Engineer', accessLevel: 'Collaborator' }
];

export const ALL_PROJECTS: Project[] = [
  {
    id: 'p1',
    name: 'Wildfire Dynamics Model',
    type: 'Government',
    organization: 'Forestry Commission',
    description: 'Developing high-resolution simulations for predicting forest fire propagation using meteorological data.',
    members: 24,
    ownerId: 'admin',
    team: [...MOCK_TEAM],
    tags: ['Ecology', 'Predictive Modeling', 'HPC']
  },
  {
    id: 'p2',
    name: 'NextGen EV Aerodynamics',
    type: 'Private',
    organization: 'Lumen Motors',
    description: 'Testing new drag-coefficient reduction models for luxury electric sedans in virtual wind tunnels.',
    members: 12,
    ownerId: 'admin',
    team: [...MOCK_TEAM],
    tags: ['Automotive', 'CFD', 'Physics']
  },
  {
    id: 'p3',
    name: 'Quantum Topology Research',
    type: 'University',
    organization: 'Stanford University',
    description: 'Investigation of stable qubits in topological insulator environments.',
    members: 8,
    ownerId: 'admin',
    team: [...MOCK_TEAM],
    tags: ['Quantum Physics', 'Materials Science']
  },
  {
    id: 'p-secret-42',
    name: 'Neural Mesh Optimization',
    type: 'Private',
    organization: 'Cognexus Labs',
    description: 'Proprietary research into self-optimizing simulation meshes using graph neural networks.',
    members: 5,
    ownerId: 'admin',
    team: [...MOCK_TEAM],
    tags: ['AI', 'Geometry', 'HPC']
  },
  {
    id: 'gov-alpha-9',
    name: 'Secure Sub-Zero Materials',
    type: 'Government',
    organization: 'Dept. of Energy',
    description: 'Classified study on structural integrity of materials in extreme arctic conditions.',
    members: 102,
    ownerId: 'admin',
    team: [...MOCK_TEAM],
    tags: ['Materials', 'Classified']
  }
];

export const INITIAL_PROJECT_IDS = ['p1', 'p2', 'p3'];

export const HPC_CLUSTERS: HPCCluster[] = [
  { id: 'hpc-1', name: 'Aurora-1', location: 'Seattle, WA', lat: 47.6062, lng: -122.3321, nodes: 4096, status: 'Online' },
  { id: 'hpc-2', name: 'Blue-Giant', location: 'Austin, TX', lat: 30.2672, lng: -97.7431, nodes: 2048, status: 'Online' },
  { id: 'hpc-3', name: 'Summit-West', location: 'San Francisco, CA', lat: 37.7749, lng: -122.4194, nodes: 8192, status: 'Full' },
  { id: 'hpc-4', name: 'Euro-Node', location: 'Munich, DE', lat: 48.1351, lng: 11.5820, nodes: 1024, status: 'Maintenance' }
];
