
import React, { useState, useEffect, useRef } from 'react';
import { HPC_CLUSTERS } from '../constants';
import { HPCCluster, SimulationResult, Document, ProjectFile } from '../types';
import { MapPin, Cpu, Play, Activity, CheckCircle2, Loader2, Sparkles, FileText, X, Zap, DollarSign, Download, Send, MessageSquareText } from 'lucide-react';
import { summarizeSimulation, analyzeSimulationFollowUp } from '../services/geminiService';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Label } from 'recharts';

interface Props {
  projectName: string;
  inputDocs?: Document[];
  onClearInput?: () => void;
  onSimulationComplete?: (file: ProjectFile) => void;
}

interface FollowUpMessage {
  role: 'user' | 'model';
  text: string;
}

const HPCPortal: React.FC<Props> = ({ projectName, inputDocs = [], onClearInput, onSimulationComplete }) => {
  const [selectedCluster, setSelectedCluster] = useState<HPCCluster | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [nearbyCluster, setNearbyCluster] = useState<string | null>(null);

  // Follow-up chat state
  const [followUpInput, setFollowUpInput] = useState('');
  const [followUpHistory, setFollowUpHistory] = useState<FollowUpMessage[]>([]);
  const [isAskingFollowUp, setIsAskingFollowUp] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [followUpHistory]);

  const runSimulation = () => {
    if (!selectedCluster) return;
    setIsRunning(true);
    setProgress(0);
    setResult(null);
    setFollowUpHistory([]);

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

    // Project-specific log templates
    const logDetails = projectName.toLowerCase().includes('wildfire') 
      ? 'Initializing Atmospheric Perimeter Meshes... Solving Wind Dispersion Grids...'
      : projectName.toLowerCase().includes('ev') || projectName.toLowerCase().includes('aero')
      ? 'Solving Navier-Stokes CFD Equations... Drag-Coefficient optimization active...'
      : projectName.toLowerCase().includes('quantum')
      ? 'Initializing Topological Insulator Lattice... Resolving Qubit Coherence states...'
      : 'Initializing High-Resolution Meshes... Running specialized scientific solvers...';

    const mockLogs = `
[JOB START] ID: HPC-${Math.floor(Math.random()*10000)}${docContext}
[CONFIG] Nodes: 128, Threads: 1024
[STEP 1] ${logDetails}
[STEP 2] Multi-node GPU synchronization active.
[WARN] Iteration 42: Convergence delay detected - applying adaptive stepping.
[STEP 3] Optimizing parameters for ${projectName}...
[SUCCESS] Final convergence reached at 1.4e-6
[EXIT] Exporting result set to Nexus S3 secure bucket.
    `.trim();

    const gpuPerf = "NVIDIA A100 @ 312 TFLOPS (Peak 87%)";
    const estimatedCost = `$${(Math.random() * 15 + 2.50).toFixed(2)}`;

    const simulationResult: SimulationResult = {
      jobId: `SIM-${Math.floor(Math.random()*9999)}`,
      timestamp: new Date().toLocaleTimeString(),
      logs: mockLogs,
      dataPoints: mockData,
      gpuPerformance: gpuPerf,
      cost: estimatedCost
    };

    setResult(simulationResult);

    let generatedFileName = '';
    if (onSimulationComplete) {
      generatedFileName = `Result_${simulationResult.jobId}_Analysis_${projectName.replace(/\s+/g, '_')}.xlsx`;
      const generatedFile: ProjectFile = {
        id: `f-sim-${Date.now()}`,
        name: `Result_${simulationResult.jobId}_Analysis_${projectName.replace(/\s+/g, '_')}`,
        extension: 'xlsx',
        size: '2.4 MB',
        source: 'Simulation',
        timestamp: 'Just now',
        category: 'Result'
      };
      onSimulationComplete(generatedFile);
    }

    setIsSummarizing(true);
    const summaryContext = `${projectName} (HPC Cluster: ${selectedCluster?.name}). 
    Output Files Generated: ${generatedFileName}. 
    Input Files Used: ${inputDocs.length > 0 ? inputDocs.map(d => d.title).join(', ') : 'None'}.`;
    
    const summary = await summarizeSimulation(mockLogs, summaryContext);
    setResult(prev => prev ? { ...prev, summary } : null);
    setIsSummarizing(false);
  };

  const handleFollowUpQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!followUpInput.trim() || !result || isAskingFollowUp) return;

    const userQuestion = followUpInput;
    setFollowUpInput('');
    setFollowUpHistory(prev => [...prev, { role: 'user', text: userQuestion }]);
    setIsAskingFollowUp(true);

    try {
      const historyForGemini = followUpHistory.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

      const stream = await analyzeSimulationFollowUp(
        result.summary || '', 
        result.logs, 
        userQuestion, 
        historyForGemini
      );
      
      let assistantText = '';
      setFollowUpHistory(prev => [...prev, { role: 'model', text: '' }]);

      for await (const chunk of stream) {
        assistantText += chunk.text;
        setFollowUpHistory(prev => {
          const updated = [...prev];
          updated[updated.length - 1].text = assistantText;
          return updated;
        });
      }
    } catch (error) {
      console.error(error);
      setFollowUpHistory(prev => [...prev, { role: 'model', text: "I encountered an error analyzing your question. Please try again." }]);
    } finally {
      setIsAskingFollowUp(false);
    }
  };

  const formatAnalysis = (text: string) => {
    return text.split('\n').map((line, idx) => {
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return <li key={idx} className="ml-4 mb-1 list-disc text-black">{line.substring(2)}</li>;
      }
      if (line.match(/^[A-Z][^a-z]+:$/) || line.includes('###') || line.includes('Interpretation') || line.includes('Takeaway') || line.includes('Finding')) {
        return <h4 key={idx} className="font-bold text-gray-900 mt-4 mb-2 uppercase text-xs tracking-wider border-l-2 border-blue-500 pl-2">{line.replace(/###/g, '').trim()}</h4>;
      }
      return <p key={idx} className="mb-2 whitespace-pre-wrap text-black">{line}</p>;
    });
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
              <button onClick={onClearInput} className="text-white/60 hover:text-white transition-colors">
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
                  selectedCluster?.id === cluster.id ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-gray-100 hover:border-blue-200 bg-white'
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
            {isRunning ? <><Loader2 className="animate-spin" /> <span>Running {progress}%</span></> : <><Play size={18} /> <span>Submit Job</span></>}
          </button>
        </div>
      </div>

      <div className="lg:col-span-2 space-y-6">
        {isRunning && (
          <div className="bg-blue-600/5 border border-blue-100 rounded-2xl p-12 flex flex-col items-center justify-center text-center animate-pulse">
            <Loader2 size={48} className="text-blue-600 animate-spin mb-4" />
            <h4 className="text-xl font-bold text-black">HPC Node Allocation</h4>
            <div className="w-full max-w-md bg-gray-200 h-2 rounded-full mt-6 overflow-hidden">
              <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        )}

        {!isRunning && !result && (
          <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-12 flex flex-col items-center justify-center text-center opacity-60">
            <Activity size={48} className="text-gray-300 mb-4" />
            <h4 className="text-lg font-medium text-gray-500">No Active Simulations</h4>
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
              </div>
              
              <div className="h-[250px] w-full mb-6">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={result.dataPoints}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="x" stroke="#94a3b8" fontSize={10}>
                      <Label value="Time (Iteration Units)" offset={-10} position="insideBottom" style={{ fontSize: '10px', fontWeight: 'bold', fill: '#94a3b8' }} />
                    </XAxis>
                    <YAxis stroke="#94a3b8" fontSize={10}>
                      <Label value="Energy Convergence" angle={-90} position="insideLeft" offset={10} style={{ fontSize: '10px', fontWeight: 'bold', fill: '#94a3b8' }} />
                    </YAxis>
                    <Tooltip />
                    <Line type="monotone" dataKey="y" stroke="#2563eb" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-1 gap-6">
                {/* AI Contextual Analysis Card */}
                <div className="bg-blue-50/50 border border-blue-200 rounded-2xl overflow-hidden flex flex-col shadow-sm">
                  <div className="px-6 py-4 bg-white border-b border-blue-100 flex items-center justify-between">
                    <div className="flex items-center text-blue-700 font-bold text-base">
                      <Sparkles size={18} className="mr-2" />
                      Professional Data Interpretation
                    </div>
                    <div className="text-[10px] font-black bg-blue-600 text-white px-2 py-0.5 rounded uppercase tracking-widest">
                      AI Statistical Expert
                    </div>
                  </div>

                  <div className="p-6 max-h-[500px] overflow-y-auto custom-scrollbar">
                    {isSummarizing ? (
                      <div className="flex flex-col items-center py-12">
                        <Loader2 className="animate-spin text-blue-400 mb-2" size={32} />
                        <span className="text-xs text-blue-400 font-bold uppercase tracking-widest">Compiling statistical takeaways...</span>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {/* Initial Analysis Result */}
                        <div className="prose prose-sm max-w-none text-black leading-relaxed">
                          {formatAnalysis(result.summary || '')}
                        </div>

                        {/* Follow-up Chat History */}
                        {followUpHistory.length > 0 && (
                          <div className="pt-6 border-t border-blue-100 space-y-4">
                            <h5 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-4 flex items-center">
                              <MessageSquareText size={12} className="mr-1" /> Follow-up Discussion
                            </h5>
                            {followUpHistory.map((m, idx) => (
                              <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] p-3 rounded-xl text-sm ${
                                  m.role === 'user' 
                                    ? 'bg-blue-600 text-white rounded-br-none font-medium' 
                                    : 'bg-white border border-blue-100 text-gray-800 rounded-bl-none shadow-sm'
                                }`}>
                                  {m.text || <Loader2 className="animate-spin" size={14} />}
                                </div>
                              </div>
                            ))}
                            <div ref={chatEndRef} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Follow-up Question Box */}
                  {!isSummarizing && result.summary && (
                    <div className="p-4 bg-white border-t border-blue-100">
                      <form onSubmit={handleFollowUpQuestion} className="relative flex items-center">
                        <input
                          type="text"
                          value={followUpInput}
                          onChange={(e) => setFollowUpInput(e.target.value)}
                          placeholder="Ask a question about this data analysis..."
                          disabled={isAskingFollowUp}
                          className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all text-black shadow-inner"
                        />
                        <button
                          type="submit"
                          disabled={!followUpInput.trim() || isAskingFollowUp}
                          className="absolute right-2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-200 transition-colors shadow-sm"
                        >
                          {isAskingFollowUp ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                        </button>
                      </form>
                      <p className="text-[9px] text-gray-400 mt-2 text-center font-medium">
                        Ask about outliers, specific trends, or what these results mean for ${projectName}.
                      </p>
                    </div>
                  )}
                </div>

                <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                  <div className="text-[10px] text-gray-500 font-mono mb-2 uppercase tracking-widest flex justify-between">
                    <span>HPC Node Execution Logs</span>
                  </div>
                  <pre className="text-green-400 font-mono text-[10px] overflow-y-auto max-h-[120px] custom-scrollbar leading-tight">
                    {result.logs}
                  </pre>
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
