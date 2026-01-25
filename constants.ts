
import { Project, HPCCluster, TeamMember, Document, ProjectFile } from './types';

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
    tags: ['Ecology', 'Predictive Modeling', 'HPC'],
    initialDocuments: [
      { id: 'p1d1', title: 'Oregon Sector B - Propagation Hypothesis', author: 'Dr. Thorne', type: 'Draft', status: 'In Review', updatedAt: '2 hours ago' },
      { id: 'p1d2', title: 'Q3 Fire Perimeter Standard Ops', author: 'Sarah Jenkins', type: 'Publication', status: 'Approved', updatedAt: 'Yesterday' },
      { id: 'p1d3', title: 'Fuel Load Density Review', author: 'Alex Rivera', type: 'Review', status: 'Pending', updatedAt: '3 days ago' }
    ],
    initialFiles: [
      { id: 'p1f1', name: 'sensor_array_seattle_south', extension: 'csv', size: '42 MB', source: 'User', timestamp: '2 hours ago', category: 'Data' },
      { id: 'p1f2', name: 'topological_overlay_v4', extension: 'json', size: '128 MB', source: 'System', timestamp: '5 hours ago', category: 'Mesh' },
      { id: 'p1f3', name: 'smoke_dispersion_render', extension: 'png', size: '4.2 MB', source: 'Simulation', timestamp: 'Yesterday', category: 'Result' }
    ]
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
    tags: ['Automotive', 'CFD', 'Physics'],
    initialDocuments: [
      { id: 'p2d1', title: 'Wind Tunnel Calibration Report', author: 'Alex Rivera', type: 'Draft', status: 'Pending', updatedAt: '1 hour ago' },
      { id: 'p2d2', title: 'Aerodynamics of Tapered Chassis', author: 'Dr. Thorne', type: 'Publication', status: 'Approved', updatedAt: '4 days ago' }
    ],
    initialFiles: [
      { id: 'p2f1', name: 'chassis_v2_topology', extension: 'json', size: '512 MB', source: 'User', timestamp: 'Yesterday', category: 'Mesh' },
      { id: 'p2f2', name: 'drag_coefficient_results', extension: 'xlsx', size: '1.2 MB', source: 'Simulation', timestamp: '2 days ago', category: 'Result' },
      { id: 'p2f3', name: 'vorticity_heatmap_tail', extension: 'png', size: '2.8 MB', source: 'Simulation', timestamp: '2 days ago', category: 'Result' }
    ]
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
    tags: ['Quantum Physics', 'Materials Science'],
    initialDocuments: [
      { id: 'p3d1', title: 'Topological Insulator Stability Study', author: 'Dr. Thorne', type: 'Draft', status: 'In Review', updatedAt: '10 mins ago' },
      { id: 'p3d2', title: 'Qubit Coherence Peer Review', author: 'Sarah Jenkins', type: 'Review', status: 'Approved', updatedAt: 'Last week' }
    ],
    initialFiles: [
      { id: 'p3f1', name: 'lattice_structure_v1', extension: 'json', size: '15 MB', source: 'User', timestamp: 'Yesterday', category: 'Mesh' },
      { id: 'p3f2', name: 'cryogenic_temp_logs', extension: 'csv', size: '84 MB', source: 'System', timestamp: '3 days ago', category: 'Data' }
    ]
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
    tags: ['AI', 'Geometry', 'HPC'],
    initialDocuments: [
      { id: 'psd1', title: 'GNN Hyperparameter Tuning', author: 'Alex Rivera', type: 'Draft', status: 'Pending', updatedAt: '2 days ago' },
      { id: 'psd2', title: 'Proprietary Mesh Logic v0.4', author: 'Dr. Thorne', type: 'Review', status: 'Approved', updatedAt: 'Yesterday' }
    ],
    initialFiles: [
      { id: 'psf1', name: 'mesh_optimization_weights', extension: 'json', size: '2.1 GB', source: 'User', timestamp: '1 day ago', category: 'Data' },
      { id: 'psf2', name: 'converged_mesh_topology', extension: 'json', size: '89 MB', source: 'Simulation', timestamp: '2 days ago', category: 'Mesh' }
    ]
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
    tags: ['Materials', 'Classified'],
    initialDocuments: [
      { id: 'gvd1', title: 'Arctic Stress Test - Phase 1', author: 'Dr. Thorne', type: 'Review', status: 'Approved', updatedAt: '5 days ago' },
      { id: 'gvd2', title: 'Classified Material Specs X-19', author: 'Admin', type: 'Publication', status: 'In Review', updatedAt: '2 days ago' }
    ],
    initialFiles: [
      { id: 'gvf1', name: 'material_brittleness_data', extension: 'csv', size: '920 MB', source: 'System', timestamp: 'Yesterday', category: 'Data' },
      { id: 'gvf2', name: 'failure_point_graph', extension: 'png', size: '5.4 MB', source: 'Simulation', timestamp: '3 days ago', category: 'Result' }
    ]
  }
];

export const INITIAL_PROJECT_IDS = ['p1', 'p2', 'p3'];

export const HPC_CLUSTERS: HPCCluster[] = [
  { id: 'hpc-1', name: 'Aurora-1', location: 'Seattle, WA', lat: 47.6062, lng: -122.3321, nodes: 4096, status: 'Online' },
  { id: 'hpc-2', name: 'Blue-Giant', location: 'Austin, TX', lat: 30.2672, lng: -97.7431, nodes: 2048, status: 'Online' },
  { id: 'hpc-3', name: 'Summit-West', location: 'San Francisco, CA', lat: 37.7749, lng: -122.4194, nodes: 8192, status: 'Full' },
  { id: 'hpc-4', name: 'Euro-Node', location: 'Munich, DE', lat: 48.1351, lng: 11.5820, nodes: 1024, status: 'Maintenance' }
];
