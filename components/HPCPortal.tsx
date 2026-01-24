
import React, { useState, useEffect } from 'react';
import { HPC_CLUSTERS } from '../constants';
import { HPCCluster, SimulationResult, Document } from '../types';
import { MapPin, Cpu, Play, Activity, CheckCircle2, Loader2, Sparkles, FileText, X } from 'lucide-react';
import { summarizeSimulation } from '../services/geminiService';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Props {
  projectName: string;
  inputDocs?: Document[];
  onClearInput?: () => void;
}

const HPCPortal: React.FC<Props> = ({ projectName, inputDocs = [], onClearInput }) => {
  const [selectedCluster, setSelectedCluster] = useState<HPCCluster | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [nearbyCluster, setNearbyCluster] = useState<string | null>(null);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((position) => {
        const { latitude, longitude } = position.coords;
        let closest = HPC_CLUSTERS[0];
        let minDist = Infinity;
        
        HPC_CLUSTERS.forEach(cluster => {
          const d = Math.sqrt(Math.pow(cluster.lat - latitude, 2) + Math.pow(cluster.lng - longitude, 2));
          if (d < minDist) {
            minDist = d;
            closest = cluster;
          }
        });
        setNearbyCluster(closest.id);
      });
    }
  }, []);

  const runSimulation = () => {
    if (!selectedCluster) return;
    setIsRunning(true);
    setProgress(0);
    setResult(null);

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          finishSimulation();
          return 100;
        }
        return prev + 5;
      });
    }, 200);
  };

  const finishSimulation = async () => {
    setIsRunning(false);
    const mockData = Array.from({ length: 20 }, (_, i) => ({
      x: i,
      y: Math.random() * 100 + (i * 2)
    }));
    
    const docContext = inputDocs.length > 0 
      ? `\n[INPUT ATTACHED] Files: ${inputDocs.map(d => d.title).join(', ')}` 
      : '';

    const mockLogs = `
[JOB START] ID: HPC-${Math.floor(Math.random()*10000)}${docContext}
[CONFIG] Nodes: 128, Threads: 1024
[STEP 1] Initializing Mesh Grids from Input Data...
[STEP 2] Solving Navier-Stokes Equations...
[WARN] Iteration 42: Convergence delay detected.
[STEP 3] Optimizing parameters...
[SUCCESS] Final convergence reached at 1.4e-6
[EXIT] Exporting result set to Nexus S3.
    `.trim();

    setResult({
      jobId: `SIM-${Math.floor(Math.random()*9999)}`,
      timestamp: new Date().toLocaleTimeString(),
      logs: mockLogs,
      dataPoints: mockData
    });

    setIsSummarizing(true);
    const summaryContext = `${projectName}${inputDocs.length > 0 ? ` (Integrated with files: ${inputDocs.map(d => d.title).join(', ')})` : ''}`;
    const summary = await summarizeSimulation(mockLogs, summaryContext);
    setResult(prev => prev ? { ...prev, summary } : null);
    setIsSummarizing(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-20">
      <div className="lg:col-span-1 space-y-6">
        {/* Staged Inputs Section */}
        {inputDocs.length > 0 && (
          <div className="bg-blue-600 rounded-2xl p-4 shadow-lg shadow-blue-100 animate-in slide-in-from-left-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-bold text-xs uppercase tracking-widest flex items-center">
                <FileText className="mr-2" size={14} /> Staged Input Data
              </h3>
              <button 
                onClick={onClearInput}
                className="text-white/60 hover:text-white transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="space-y-2">
              {inputDocs.map(doc => (
                <div key={doc.id} className="bg-white/10 backdrop-blur-sm px-3 py-2 rounded-lg flex items-center justify-between group">
                  <span className="text-xs text-white truncate max-w-[180px] font-medium">{doc.title}</span>
                  <div className="bg-green-400 w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(74,222,128,0.8)]"></div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-white/50 mt-3 italic">
              These files will be used as initial conditions for the simulation mesh.
            </p>
          </div>
        )}

        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center text-black">
            <Cpu className="mr-2 text-blue-600" size={20} />
            Select Cluster
          </h3>
          <div className="space-y-2">
            {HPC_CLUSTERS.map(cluster => (
              <button
                key={cluster.id}
                disabled={cluster.status !== 'Online' || isRunning}
                onClick={() => setSelectedCluster(cluster)}
                className={`w-full p-4 rounded-xl border text-left transition-all text-black ${
                  selectedCluster?.id === cluster.id
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                    : 'border-gray-100 hover:border-blue-200 bg-white'
                } ${cluster.status !== 'Online' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold">{cluster.name}</div>
                    <div className="text-xs text-gray-500 flex items-center mt-1">
                      <MapPin size={12} className="mr-1" />
                      {cluster.location}
                    </div>
                  </div>
                  {nearbyCluster === cluster.id && (
                    <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">NEARBY</span>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-400">{cluster.nodes} Nodes</span>
                  <span className={`text-xs font-bold ${cluster.status === 'Online' ? 'text-green-600' : 'text-red-500'}`}>
                    {cluster.status}
                  </span>
                </div>
              </button>
            ))}
          </div>

          <button
            onClick={runSimulation}
            disabled={!selectedCluster || isRunning}
            className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center space-x-2 disabled:bg-gray-300 hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
          >
            {isRunning ? (
              <><Loader2 className="animate-spin" /> <span>Running {progress}%</span></>
            ) : (
              <><Play size={18} /> <span>Submit Job</span></>
            )}
          </button>
        </div>
      </div>

      <div className="lg:col-span-2 space-y-6">
        {isRunning && (
          <div className="bg-blue-600/5 border border-blue-100 rounded-2xl p-8 flex flex-col items-center justify-center text-center animate-pulse">
            <Loader2 size={48} className="text-blue-600 animate-spin mb-4" />
            <h4 className="text-xl font-bold text-black">Simulation in Progress</h4>
            <p className="text-gray-500 max-w-sm mt-2">Connecting to {selectedCluster?.name}. Allocating nodes and pushing environment variables.</p>
            {inputDocs.length > 0 && (
              <div className="mt-4 px-3 py-1 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full">
                PROCESSING {inputDocs.length} INPUT FILES
              </div>
            )}
            <div className="w-full max-w-md bg-gray-200 h-2 rounded-full mt-6 overflow-hidden">
              <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        )}

        {!isRunning && !result && (
          <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-12 flex flex-col items-center justify-center text-center opacity-60">
            <Activity size={48} className="text-gray-300 mb-4" />
            <h4 className="text-lg font-medium text-gray-500">No Active Simulations</h4>
            <p className="text-gray-400 text-sm mt-1">Select an HPC cluster to begin your testing cycle.</p>
          </div>
        )}

        {result && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-black text-lg flex items-center">
                  <CheckCircle2 className="text-green-500 mr-2" size={20} />
                  Job Results: {result.jobId}
                </h3>
                <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">{result.timestamp}</span>
              </div>
              
              <div className="h-[250px] w-full mb-6 text-black">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={result.dataPoints}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="x" hide />
                    <YAxis stroke="#94a3b8" fontSize={12} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', color: 'black' }} />
                    <Line type="monotone" dataKey="y" stroke="#2563eb" strokeWidth={3} dot={false} animationDuration={1000} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-900 rounded-xl p-4 overflow-hidden">
                  <div className="text-[10px] text-gray-500 font-mono mb-2 uppercase tracking-widest">System Logs</div>
                  <pre className="text-green-400 font-mono text-[10px] overflow-y-auto max-h-[150px] custom-scrollbar leading-tight">
                    {result.logs}
                  </pre>
                </div>
                <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 flex flex-col">
                  <div className="flex items-center text-blue-700 font-bold text-sm mb-3">
                    <Sparkles size={16} className="mr-1.5" />
                    AI Contextual Analysis
                  </div>
                  {isSummarizing ? (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="flex flex-col items-center">
                        <Loader2 className="animate-spin text-blue-400 mb-2" />
                        <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">Analyzing staged files...</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-black leading-relaxed italic">
                      {result.summary}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HPCPortal;
