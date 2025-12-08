
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Lock, BarChart2, PieChart, CheckCircle, XCircle, AlertTriangle, User, Download, Clock, Search, Users, FileText, Eye, Shield, X, RefreshCw, Unlock, Plus, Key, ScrollText, Radar } from 'lucide-react';
import { AssessmentData, QuestionType, Question, AssessmentHistoryItem } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, ScatterChart, Scatter, ZAxis, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar as RechartsRadar } from 'recharts';
import { loginAdmin, fetchSessionEvidence, fetchAllSessions, reactivateCandidate, createCandidate, fetchAuthorizedCandidates } from '../services/geminiService';

interface AnalyticsViewProps {
  data: AssessmentData | null;
  answers: Record<string, any>;
  history: AssessmentHistoryItem[];
}

/**
 * SECURE IMAGE COMPONENT
 * Renders images on a canvas with a watermark and "Flashlight" effect.
 * Prevents right-click, save, and full screenshotting.
 */
const SecureEvidenceImage: React.FC<{ base64: string; adminId: string }> = ({ base64, adminId }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [isHovering, setIsHovering] = useState(false);

    useEffect(() => {
        if (!base64) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const img = new Image();
        img.src = base64;
        img.onload = () => {
            canvas.width = 320;
            canvas.height = 240;
            
            // 1. Draw Base Image
            ctx.drawImage(img, 0, 0, 320, 240);

            // 2. Draw Heavy Watermark
            ctx.save();
            ctx.globalAlpha = 0.15;
            ctx.rotate(-Math.PI / 4);
            ctx.font = "bold 16px sans-serif";
            ctx.fillStyle = "white";
            for(let i=-200; i<500; i+=60) {
                for(let j=-200; j<500; j+=40) {
                     ctx.fillText(`${adminId} ${new Date().toLocaleTimeString()}`, i, j);
                }
            }
            ctx.restore();
        };
    }, [base64, adminId]);

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        setMousePos({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        });
        setIsHovering(true);
    };

    if (!base64) {
        return (
            <div className="w-[320px] h-[240px] bg-slate-800 flex items-center justify-center text-slate-500 text-xs">
                No Image Data Available
            </div>
        );
    }

    return (
        <div 
            ref={containerRef}
            className="relative w-[320px] h-[240px] bg-black overflow-hidden rounded-lg cursor-crosshair secure-content"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setIsHovering(false)}
            onContextMenu={(e) => e.preventDefault()}
        >
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
            
            {/* 3. FLASHLIGHT MASK: Only reveal area near mouse, blur rest */}
            <div 
                className="absolute inset-0 pointer-events-none transition-opacity duration-200"
                style={{
                    background: isHovering 
                        ? `radial-gradient(circle 80px at ${mousePos.x}px ${mousePos.y}px, transparent 0%, rgba(0,0,0,0.98) 100%)`
                        : 'rgba(0,0,0,0.98)'
                }}
            />
            
            {/* 4. Overlay to block drag/drop */}
            <div className="absolute inset-0 z-50"></div>

            {!isHovering && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-500 text-xs">
                    <span className="flex items-center"><Eye className="w-4 h-4 mr-1" /> Hover to Inspect</span>
                </div>
            )}
        </div>
    );
};

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ data, answers, history }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [studentFilter, setStudentFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'MANAGEMENT'>('DASHBOARD');
  
  // Real Data from Backend
  const [backendSessions, setBackendSessions] = useState<any[]>([]);
  const [authorizedCandidates, setAuthorizedCandidates] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // New User Form
  const [newCandidate, setNewCandidate] = useState({ email: '', code: '' });
  const [createMsg, setCreateMsg] = useState({ type: '', text: '' });

  // Security Modal State
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [evidenceData, setEvidenceData] = useState<{evidence: any[], logs: any[], candidateName: string, topicScores: Record<string, number>} | null>(null);
  const [modalTab, setModalTab] = useState<'EVIDENCE'|'LOGS'|'TOPICS'>('TOPICS');

  const refreshData = async () => {
      setIsRefreshing(true);
      const sessions = await fetchAllSessions();
      setBackendSessions(sessions);
      
      const candidates = await fetchAuthorizedCandidates();
      setAuthorizedCandidates(candidates.candidates || []);
      
      setIsRefreshing(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    // Call Secure Backend for Login
    const result = await loginAdmin(credentials.username, credentials.password);
    
    if (result.success) {
      setIsAuthenticated(true);
      // Fetch data immediately upon login
      await refreshData();
    } else {
      setError('Invalid ID or Password. Server rejected credentials.');
    }
    setIsLoading(false);
  };

  const handleCreateCandidate = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newCandidate.email || !newCandidate.code) {
          setCreateMsg({ type: 'error', text: 'Please fill all fields' });
          return;
      }
      
      const res = await createCandidate(newCandidate.email, newCandidate.code);
      if (res.success) {
          setCreateMsg({ type: 'success', text: 'Candidate authorized successfully.' });
          setNewCandidate({ email: '', code: '' });
          refreshData(); // Reload list
      } else {
          setCreateMsg({ type: 'error', text: res.error || 'Creation Failed' });
      }
  };

  const handleViewEvidence = async (sessionId: string) => {
      setSelectedSessionId(sessionId);
      setEvidenceData(null);
      setModalTab('TOPICS');
      const data = await fetchSessionEvidence(sessionId);
      setEvidenceData(data);
  };

  const handleCloseModal = () => {
      setSelectedSessionId(null);
      setEvidenceData(null);
  };

  const handleReactivate = async (email: string) => {
      if(!confirm(`Are you sure you want to reactivate access for ${email}?`)) return;
      await reactivateCandidate(email);
      alert(`Access for ${email} has been reactivated.`);
  };

  // --- CSV EXPORT LOGIC ---

  const downloadCSV = (filename: string, csvContent: string) => {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleExportMasterCSV = () => {
      if (backendSessions.length === 0) return alert("No data available to export.");

      // CSV Header
      let csv = "Session ID,Candidate Name,Email,Status,Score,S1(MCQ),S2(FITB),S3(Code),DSA Score,DB Score,Net Score,OS Score,Max Score,Time Taken (Min),Violations Count,Summary,Strengths,Weaknesses,Roadmap\n";

      // CSV Rows
      backendSessions.forEach(session => {
          const feedback = session.feedback || {};
          const strengths = (feedback.strengths || []).join('; ');
          const weaknesses = (feedback.weaknesses || []).join('; ');
          const roadmap = (feedback.roadmap || []).join('; ');
          const summary = (feedback.summary || "").replace(/,/g, " "); // simple escape
          const scores = session.sectionScores || {s1:0,s2:0,s3:0};
          const topics = session.topicScores || {};

          const row = [
              session.sessionId,
              `"${session.candidateName}"`,
              session.email,
              session.status,
              session.score,
              scores.s1,
              scores.s2,
              scores.s3,
              topics['DSA'] || 0,
              topics['Databases'] || 0,
              topics['Networking'] || 0,
              topics['OS'] || 0,
              session.maxScore,
              Math.round((session.timestamp - (session.startTime || session.timestamp)) / 60000) || 30, // Approx
              session.evidenceCount,
              `"${summary}"`,
              `"${strengths}"`,
              `"${weaknesses}"`,
              `"${roadmap}"`
          ].join(",");
          csv += row + "\n";
      });

      downloadCSV(`eVALUEate_Master_Report_${new Date().toISOString().split('T')[0]}.csv`, csv);
  };

  const handleExportStudentCSV = (session: any) => {
      const feedback = session.feedback || {};
      const scores = session.sectionScores || {s1:0,s2:0,s3:0};
      const topics = session.topicScores || {};
      
      let csv = `eVALUEate Individual Candidate Report\n`;
      csv += `Generated On,${new Date().toLocaleString()}\n\n`;
      
      csv += `CANDIDATE DETAILS\n`;
      csv += `Name,${session.candidateName}\n`;
      csv += `Email,${session.email}\n`;
      csv += `Session ID,${session.sessionId}\n`;
      csv += `Status,${session.status}\n`;
      csv += `Total Score,${session.score} / ${session.maxScore}\n`;
      csv += `Section 1 (MCQ),${scores.s1}\n`;
      csv += `Section 2 (FITB),${scores.s2}\n`;
      csv += `Section 3 (Coding),${scores.s3}\n\n`;
      
      csv += `TOPIC ANALYSIS\n`;
      csv += `DSA,${topics['DSA'] || 0}\n`;
      csv += `Databases,${topics['Databases'] || 0}\n`;
      csv += `Networking,${topics['Networking'] || 0}\n`;
      csv += `Operating Systems,${topics['OS'] || 0}\n`;
      csv += `Software Engineering,${topics['Software Eng'] || 0}\n\n`;

      csv += `PERFORMANCE ANALYSIS\n`;
      csv += `Summary,"${feedback.summary || 'N/A'}"\n`;
      csv += `Key Strengths,"${(feedback.strengths || []).join('; ')}"\n`;
      csv += `Areas for Improvement,"${(feedback.weaknesses || []).join('; ')}"\n`;
      csv += `Recommended Roadmap,"${(feedback.roadmap || []).join('; ')}"\n\n`;

      csv += `PROCTORING LOG\n`;
      csv += `Violations Detected,${session.evidenceCount}\n`;
      
      downloadCSV(`${session.candidateName.replace(/\s+/g,'_')}_Report.csv`, csv);
  };

  // Prevent Clipboard Copy
  useEffect(() => {
      const handleCopy = (e: ClipboardEvent) => {
          e.preventDefault();
          alert("Security Alert: Copying data from the Admin Console is strictly prohibited.");
      };
      if (isAuthenticated) {
          document.addEventListener('copy', handleCopy);
          document.addEventListener('contextmenu', (e) => e.preventDefault());
      }
      return () => {
          document.removeEventListener('copy', handleCopy);
          document.removeEventListener('contextmenu', (e) => e.preventDefault());
      };
  }, [isAuthenticated]);

  const cohortData = useMemo(() => {
    return backendSessions.filter(item => item.candidateName.toLowerCase().includes(studentFilter.toLowerCase())).map(item => ({ name: item.candidateName, score: item.score || 0, max: item.maxScore || 100 }));
  }, [backendSessions, studentFilter]);

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-50 p-6 animate-in fade-in zoom-in duration-500">
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 max-w-sm w-full text-center">
          <div className="flex justify-center mb-6"><div className="p-4 bg-slate-900 rounded-full shadow-lg"><Lock className="w-8 h-8 text-white" /></div></div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">eVALUEate Admin Console</h2>
          <p className="text-slate-500 text-sm mb-6">Secured via Backend Authorization</p>
          <form onSubmit={handleLogin} className="space-y-4 text-left">
            <div><label className="text-xs font-bold text-slate-500 uppercase">Admin ID</label><input type="text" value={credentials.username} onChange={e => setCredentials({...credentials, username: e.target.value})} className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-lg outline-none" placeholder="Enter ID" /></div>
            <div><label className="text-xs font-bold text-slate-500 uppercase">Password</label><input type="password" value={credentials.password} onChange={e => setCredentials({...credentials, password: e.target.value})} className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-lg outline-none" placeholder="••••••••" /></div>
            {error && <div className="text-rose-500 text-xs font-bold">{error}</div>}
            <button type="submit" disabled={isLoading} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-lg">{isLoading ? 'Verifying...' : 'Access Dashboard'}</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-8 select-none protected-view">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-bold text-slate-900">Admin Analytics Dashboard</h1>
             <div className="flex space-x-2">
                 <button onClick={refreshData} className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg font-medium">
                     <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                     <span>Refresh</span>
                 </button>
                 <button 
                    onClick={handleExportMasterCSV}
                    className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm transition-colors font-medium"
                 >
                     <Download className="w-4 h-4" /><span>Export Master CSV</span>
                 </button>
             </div>
        </div>

        {/* TABS */}
        <div className="flex space-x-6 border-b border-slate-200 mb-6">
            <button 
                onClick={() => setActiveTab('DASHBOARD')}
                className={`pb-3 px-2 font-medium transition-colors border-b-2 ${activeTab === 'DASHBOARD' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
                Analytics Dashboard
            </button>
            <button 
                onClick={() => setActiveTab('MANAGEMENT')}
                className={`pb-3 px-2 font-medium transition-colors border-b-2 ${activeTab === 'MANAGEMENT' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
                Candidate Management
            </button>
        </div>

        {activeTab === 'DASHBOARD' ? (
        <>
            {/* Cohort Chart */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm mb-6">
                <h3 className="text-lg font-bold text-slate-800 mb-4">Cohort Performance</h3>
                <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={cohortData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="score" fill="#6366f1" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
            </div>

            {/* Candidates List */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100"><h3 className="text-lg font-bold text-slate-800">Recent Assessments (Live Data)</h3></div>
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500">
                        <tr>
                            <th className="px-6 py-4">Candidate</th>
                            <th className="px-6 py-4">Score</th>
                            <th className="px-2 py-4 text-xs">S1</th>
                            <th className="px-2 py-4 text-xs">S2</th>
                            <th className="px-2 py-4 text-xs">S3</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {backendSessions.length === 0 ? (
                            <tr><td colSpan={7} className="text-center py-8 text-slate-500">No assessments found.</td></tr>
                        ) : (
                            backendSessions.map((record, i) => (
                                <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-slate-900">{record.candidateName}</div>
                                        <div className="text-xs text-slate-500">{record.email}</div>
                                    </td>
                                    <td className="px-6 py-4"><span className={`px-2 py-1 rounded text-xs font-bold ${record.score && record.score > 50 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{record.score} / {record.maxScore}</span></td>
                                    
                                    {/* Section Scores */}
                                    <td className="px-2 py-4 text-xs text-slate-600">{record.sectionScores?.s1 || 0}</td>
                                    <td className="px-2 py-4 text-xs text-slate-600">{record.sectionScores?.s2 || 0}</td>
                                    <td className="px-2 py-4 text-xs text-slate-600">{record.sectionScores?.s3 || 0}</td>

                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${record.status === 'TERMINATED' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'}`}>
                                            {record.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center flex items-center justify-center space-x-2">
                                        <button 
                                            onClick={() => handleExportStudentCSV(record)}
                                            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                            title="Download Report"
                                        >
                                            <FileText className="w-4 h-4" />
                                        </button>
                                        
                                        {(record.status === 'COMPLETED' || record.status === 'TERMINATED') && (
                                            <button 
                                                onClick={() => handleReactivate(record.email)}
                                                className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                                title="Unlock Access"
                                            >
                                                <Unlock className="w-4 h-4" />
                                            </button>
                                        )}
                                        
                                        <button 
                                            onClick={() => handleViewEvidence(record.sessionId)}
                                            className="p-2 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors font-bold text-xs flex items-center"
                                        >
                                            <Shield className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Create New Candidate Form */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm h-fit">
                <div className="flex items-center space-x-3 mb-6 border-b border-slate-100 pb-4">
                    <div className="p-2 bg-indigo-100 rounded-lg"><Plus className="w-5 h-5 text-indigo-600" /></div>
                    <h3 className="text-lg font-bold text-slate-800">Authorize New Candidate</h3>
                </div>
                
                <form onSubmit={handleCreateCandidate} className="space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Candidate Email</label>
                        <input 
                            type="email" 
                            className="w-full px-4 py-3 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="e.g. new.hire@company.com"
                            value={newCandidate.email}
                            onChange={(e) => setNewCandidate({...newCandidate, email: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Access Code</label>
                        <div className="relative">
                            <input 
                                type="text" 
                                className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                                placeholder="e.g. CODE2025"
                                value={newCandidate.code}
                                onChange={(e) => setNewCandidate({...newCandidate, code: e.target.value})}
                            />
                            <Key className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                        </div>
                        <button 
                            type="button"
                            onClick={() => setNewCandidate({...newCandidate, code: Math.random().toString(36).slice(-8).toUpperCase()})}
                            className="text-xs text-indigo-600 font-bold mt-2 hover:underline"
                        >
                            Generate Random Code
                        </button>
                    </div>
                    
                    {createMsg.text && (
                        <div className={`p-3 rounded-lg text-sm font-medium ${createMsg.type === 'error' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                            {createMsg.text}
                        </div>
                    )}

                    <button type="submit" className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors">
                        Create Credentials
                    </button>
                </form>
            </div>

            {/* List of Authorized Candidates */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden h-fit">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-slate-800">Authorized Credentials Directory</h3>
                    <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded">Total: {authorizedCandidates.length}</span>
                </div>
                <div className="max-h-[500px] overflow-y-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 sticky top-0">
                            <tr>
                                <th className="px-6 py-3">Email</th>
                                <th className="px-6 py-3">Access Code</th>
                                <th className="px-6 py-3 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {authorizedCandidates.map((c, i) => (
                                <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                                    <td className="px-6 py-3 font-medium text-slate-700">{c.email}</td>
                                    <td className="px-6 py-3 font-mono text-slate-500">{c.code}</td>
                                    <td className="px-6 py-3 text-center">
                                        {c.isLocked ? (
                                            <span className="inline-flex items-center px-2 py-1 rounded bg-rose-100 text-rose-700 text-xs font-bold">
                                                <Lock className="w-3 h-3 mr-1" /> Used
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center px-2 py-1 rounded bg-emerald-100 text-emerald-700 text-xs font-bold">
                                                <CheckCircle className="w-3 h-3 mr-1" /> Active
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        )}
      </div>

      {/* SECURITY MODAL: EVIDENCE & LOGS & TOPICS VIEWER */}
      {selectedSessionId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/95 backdrop-blur-sm secure-content">
              <div className="w-full max-w-6xl h-[90vh] bg-slate-900 rounded-2xl overflow-hidden flex flex-col border border-slate-700 shadow-2xl">
                  {/* Header */}
                  <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900">
                      <div>
                          <h2 className="text-xl font-bold text-white flex items-center"><Lock className="w-5 h-5 mr-2 text-rose-500" /> Secure Vault: {evidenceData?.candidateName || 'Loading...'}</h2>
                          <div className="flex space-x-4 mt-4">
                              <button 
                                onClick={() => setModalTab('TOPICS')}
                                className={`text-sm font-bold pb-1 border-b-2 ${modalTab === 'TOPICS' ? 'border-emerald-500 text-white' : 'border-transparent text-slate-500'}`}
                              >
                                Topic Analysis
                              </button>
                              <button 
                                onClick={() => setModalTab('EVIDENCE')}
                                className={`text-sm font-bold pb-1 border-b-2 ${modalTab === 'EVIDENCE' ? 'border-rose-500 text-white' : 'border-transparent text-slate-500'}`}
                              >
                                Visual Evidence
                              </button>
                              <button 
                                onClick={() => setModalTab('LOGS')}
                                className={`text-sm font-bold pb-1 border-b-2 ${modalTab === 'LOGS' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500'}`}
                              >
                                Activity Logs
                              </button>
                          </div>
                      </div>
                      <button onClick={handleCloseModal} className="p-2 hover:bg-slate-800 rounded-full text-white"><X className="w-6 h-6" /></button>
                  </div>

                  {/* Body */}
                  <div className="flex-1 overflow-y-auto p-8 bg-slate-950">
                      {!evidenceData ? (
                          <div className="flex items-center justify-center h-full text-slate-500">Decrypting Secure Storage...</div>
                      ) : modalTab === 'TOPICS' ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full">
                              {/* Radar Chart */}
                              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center">
                                  <h3 className="text-white font-bold mb-4">Skill Proficiency Radar</h3>
                                  <div className="w-full h-80">
                                      <ResponsiveContainer width="100%" height="100%">
                                          <RadarChart cx="50%" cy="50%" outerRadius="80%" data={[
                                              { subject: 'DSA', A: evidenceData.topicScores?.['DSA'] || 0, fullMark: 30 },
                                              { subject: 'Databases', A: evidenceData.topicScores?.['Databases'] || 0, fullMark: 20 },
                                              { subject: 'Networking', A: evidenceData.topicScores?.['Networking'] || 0, fullMark: 20 },
                                              { subject: 'OS', A: evidenceData.topicScores?.['OS'] || 0, fullMark: 20 },
                                              { subject: 'Software Eng', A: evidenceData.topicScores?.['Software Eng'] || 0, fullMark: 20 },
                                          ]}>
                                              <PolarGrid stroke="#334155" />
                                              <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                                              <PolarRadiusAxis angle={30} domain={[0, 30]} tick={{ fill: '#475569' }} />
                                              <RechartsRadar name="Candidate" dataKey="A" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
                                          </RadarChart>
                                      </ResponsiveContainer>
                                  </div>
                              </div>

                              {/* Breakdown Table */}
                              <div className="space-y-4">
                                  <h3 className="text-white font-bold">Detailed Topic Breakdown</h3>
                                  {Object.entries(evidenceData.topicScores || {}).map(([topic, score], idx) => (
                                      <div key={idx} className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
                                          <div>
                                              <div className="text-slate-300 font-medium">{topic}</div>
                                              <div className="text-xs text-slate-500">Accumulated Score</div>
                                          </div>
                                          <div className="text-2xl font-bold text-emerald-500">{score}</div>
                                      </div>
                                  ))}
                                  {Object.keys(evidenceData.topicScores || {}).length === 0 && (
                                      <div className="text-slate-500 italic">No specific topic data available.</div>
                                  )}
                              </div>
                          </div>
                      ) : modalTab === 'EVIDENCE' ? (
                            evidenceData.evidence.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                                    <CheckCircle className="w-12 h-12 text-emerald-500 mb-4" />
                                    <p>No violations detected for this session.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                    {evidenceData.evidence.map((ev, idx) => (
                                        <div key={idx} className="space-y-3">
                                            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                                                <span className="font-mono text-rose-400 font-bold uppercase">{ev.type.replace('_', ' ')}</span>
                                                <span>{new Date(ev.time).toLocaleTimeString()}</span>
                                            </div>
                                            <div className="ring-1 ring-slate-800 rounded-lg overflow-hidden relative group">
                                                {/* THE SECURE IMAGE RENDERER */}
                                                <SecureEvidenceImage base64={ev.img} adminId={credentials.username} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )
                      ) : (
                        // LOGS VIEW
                        <div className="space-y-2">
                            {evidenceData.logs && evidenceData.logs.length > 0 ? (
                                evidenceData.logs.map((log, i) => (
                                    <div key={i} className="flex items-start space-x-4 p-3 border-b border-slate-800 hover:bg-slate-900/50 rounded">
                                        <div className="font-mono text-xs text-slate-500 mt-1 whitespace-nowrap">
                                            {new Date(log.timestamp).toLocaleTimeString()}
                                        </div>
                                        <div>
                                            <div className={`text-sm font-bold ${log.action.includes('VIOLATION') ? 'text-rose-400' : 'text-indigo-400'}`}>
                                                {log.action}
                                            </div>
                                            <div className="text-xs text-slate-400 mt-1">{log.details}</div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-slate-500 text-center">No logs available.</div>
                            )}
                        </div>
                      )}
                  </div>

                  {/* Footer */}
                  <div className="p-4 border-t border-slate-800 bg-slate-900 text-center">
                       <p className="text-[10px] text-slate-600 font-mono">
                           SESSION ID: {selectedSessionId} • ADMIN: {credentials.username} • IP LOGGED
                       </p>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
