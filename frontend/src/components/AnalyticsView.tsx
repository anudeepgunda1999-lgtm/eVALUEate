

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Lock, BarChart2, PieChart, CheckCircle, XCircle, AlertTriangle, User, Download, Clock, Search, Users, FileText, Eye, Shield, X, RefreshCw } from 'lucide-react';
import { AssessmentData, QuestionType, Question, AssessmentHistoryItem } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, ScatterChart, Scatter, ZAxis } from 'recharts';
import { loginAdmin, fetchSessionEvidence, fetchAllSessions } from '../services/geminiService';

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
  
  // Real Data from Backend
  const [backendSessions, setBackendSessions] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Security Modal State
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [evidenceData, setEvidenceData] = useState<{evidence: any[], candidateName: string} | null>(null);

  const refreshData = async () => {
      setIsRefreshing(true);
      const sessions = await fetchAllSessions();
      setBackendSessions(sessions);
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

  const handleViewEvidence = async (sessionId: string) => {
      setSelectedSessionId(sessionId);
      setEvidenceData(null);
      const data = await fetchSessionEvidence(sessionId);
      setEvidenceData(data);
  };

  const handleCloseModal = () => {
      setSelectedSessionId(null);
      setEvidenceData(null);
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
      let csv = "Session ID,Candidate Name,Email,Status,Score,Max Score,Time Taken (Min),Violations Count,Summary,Strengths,Weaknesses,Roadmap\n";

      // CSV Rows
      backendSessions.forEach(session => {
          const feedback = session.feedback || {};
          const strengths = (feedback.strengths || []).join('; ');
          const weaknesses = (feedback.weaknesses || []).join('; ');
          const roadmap = (feedback.roadmap || []).join('; ');
          const summary = (feedback.summary || "").replace(/,/g, " "); // simple escape

          const row = [
              session.sessionId,
              `"${session.candidateName}"`,
              session.email,
              session.status,
              session.score,
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
      
      let csv = `eVALUEate Individual Candidate Report\n`;
      csv += `Generated On,${new Date().toLocaleString()}\n\n`;
      
      csv += `CANDIDATE DETAILS\n`;
      csv += `Name,${session.candidateName}\n`;
      csv += `Email,${session.email}\n`;
      csv += `Session ID,${session.sessionId}\n`;
      csv += `Status,${session.status}\n`;
      csv += `Score,${session.score} / ${session.maxScore}\n\n`;
      
      csv += `PERFORMANCE ANALYSIS\n`;
      csv += `Summary,"${feedback.summary || 'N/A'}"\n`;
      csv += `Key Strengths,"${(feedback.strengths || []).join('; ')}"\n`;
      csv += `Areas for Improvement,"${(feedback.weaknesses || []).join('; ')}"\n`;
      csv += `Recommended Roadmap,"${(feedback.roadmap || []).join('; ')}"\n\n`;

      csv += `PROCTORING LOG\n`;
      csv += `Violations Detected,${session.evidenceCount}\n`;
      // Note: We don't export strict proctoring images/details to CSV for privacy/size reasons
      
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
                         <th className="px-6 py-4">Email</th>
                         <th className="px-6 py-4">Score</th>
                         <th className="px-6 py-4">Status</th>
                         <th className="px-6 py-4 text-center">Export</th>
                         <th className="px-6 py-4 text-center">Evidence</th>
                     </tr>
                 </thead>
                 <tbody>
                     {backendSessions.length === 0 ? (
                         <tr><td colSpan={6} className="text-center py-8 text-slate-500">No assessments found.</td></tr>
                     ) : (
                         backendSessions.map((record, i) => (
                             <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                                 <td className="px-6 py-4 font-medium">{record.candidateName}</td>
                                 <td className="px-6 py-4 text-slate-500">{record.email}</td>
                                 <td className="px-6 py-4"><span className={`px-2 py-1 rounded text-xs font-bold ${record.score && record.score > 50 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{record.score} / {record.maxScore}</span></td>
                                 <td className="px-6 py-4">
                                     <span className={`px-2 py-1 rounded-full text-xs font-bold ${record.status === 'TERMINATED' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'}`}>
                                         {record.status}
                                     </span>
                                 </td>
                                 <td className="px-6 py-4 text-center">
                                     <button 
                                        onClick={() => handleExportStudentCSV(record)}
                                        className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                        title="Download In-Depth Report"
                                     >
                                         <FileText className="w-4 h-4" />
                                     </button>
                                 </td>
                                 <td className="px-6 py-4 text-center">
                                     <button 
                                        onClick={() => handleViewEvidence(record.sessionId)}
                                        className="text-rose-600 hover:text-rose-800 font-bold text-xs flex items-center justify-center mx-auto"
                                     >
                                         <Shield className="w-3 h-3 mr-1" /> View ({record.evidenceCount})
                                     </button>
                                 </td>
                             </tr>
                         ))
                     )}
                 </tbody>
             </table>
        </div>
      </div>

      {/* SECURITY MODAL: EVIDENCE VIEWER */}
      {selectedSessionId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/95 backdrop-blur-sm secure-content">
              <div className="w-full max-w-6xl h-[90vh] bg-slate-900 rounded-2xl overflow-hidden flex flex-col border border-slate-700 shadow-2xl">
                  {/* Header */}
                  <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900">
                      <div>
                          <h2 className="text-xl font-bold text-white flex items-center"><Lock className="w-5 h-5 mr-2 text-rose-500" /> Evidence Vault: {evidenceData?.candidateName || 'Loading...'}</h2>
                          <p className="text-xs text-rose-500 mt-1 font-mono uppercase tracking-widest">Strict Confidentiality Protocol Active • Do Not Share</p>
                      </div>
                      <button onClick={handleCloseModal} className="p-2 hover:bg-slate-800 rounded-full text-white"><X className="w-6 h-6" /></button>
                  </div>

                  {/* Evidence Grid */}
                  <div className="flex-1 overflow-y-auto p-8 bg-slate-950">
                      {!evidenceData ? (
                          <div className="flex items-center justify-center h-full text-slate-500">Decrypting Secure Storage...</div>
                      ) : evidenceData.evidence.length === 0 ? (
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
