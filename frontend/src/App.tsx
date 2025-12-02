
import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { ExamView } from './components/ExamView';
import { ChatView } from './components/ChatView';
import { Settings } from './components/Settings';
import { AnalyticsView } from './components/AnalyticsView';
import { View, AssessmentData, AssessmentHistoryItem, DetailedFeedback } from './types';
import { CheckCircle, Trophy, BrainCircuit, BookOpen, Target, Loader2, ArrowRight, AlertTriangle } from 'lucide-react';
import { submitAssessment, restoreSession, checkSessionStatus } from './services/geminiService';

// --- Results View (Keep same as before) ---
const ResultsView: React.FC<{ score: number; maxScore: number; onReset: () => void; feedback: DetailedFeedback | null; }> = ({ score, maxScore, onReset, feedback }) => {
  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  return (
    <div className="h-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 p-8 overflow-y-auto">
      <div className="max-w-3xl w-full bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 p-10 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900 rounded-full flex items-center justify-center mx-auto mb-6"><Trophy className="w-10 h-10 text-emerald-600 dark:text-emerald-400" /></div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Technical Assessment Submitted</h1>
        <div className="grid grid-cols-2 gap-6 mb-8 mt-8"><div className="p-6 bg-slate-50 dark:bg-slate-700 rounded-2xl"><div className="text-4xl font-bold text-indigo-600 mb-1">{score}</div><div className="text-sm font-medium text-slate-600">Total Score</div></div><div className="p-6 bg-slate-50 dark:bg-slate-700 rounded-2xl"><div className="text-4xl font-bold text-emerald-600 mb-1">{percentage}%</div><div className="text-sm font-medium text-slate-600">Accuracy</div></div></div>
        {feedback ? <div className="text-left space-y-6 mb-8"><div className="bg-indigo-50 p-6 rounded-2xl"><p className="text-indigo-800 text-sm">{feedback.summary}</p></div></div> : <div className="py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>}
        <button onClick={onReset} className="w-full py-4 bg-slate-900 dark:bg-slate-700 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors">Back to Portal Home</button>
      </div>
    </div>
  );
};

// --- Terminated View ---
const TerminatedView: React.FC<{ reason: string }> = ({ reason }) => (
  <div className="h-full flex flex-col items-center justify-center bg-rose-950 text-white p-8 select-none">
    <AlertTriangle className="w-24 h-24 text-rose-500 mb-6" />
    <h1 className="text-4xl font-bold mb-4">ACCESS DENIED</h1>
    <div className="p-8 bg-rose-900/50 rounded-2xl border border-rose-800 max-w-lg text-center">
      <p className="text-xl font-bold text-rose-200 mb-2">Assessment Terminated</p>
      <p className="text-base text-rose-400 mb-4">{reason || "Multiple Security Violations Detected"}</p>
      <p className="text-sm text-rose-500/60">This session has been permanently locked.</p>
    </div>
  </div>
);

const App: React.FC = () => {
  const [currentPortal, setCurrentPortal] = useState<'CANDIDATE' | 'ADMIN'>('CANDIDATE');
  const [currentView, setCurrentView] = useState<View>(View.DASHBOARD);
  const [candidateFormData, setCandidateFormData] = useState({ name: '', email: '', jd: '' });
  const [assessmentData, setAssessmentData] = useState<AssessmentData | null>(null);
  const [examAnswers, setExamAnswers] = useState<Record<string, any>>({});
  const [finalScore, setFinalScore] = useState<{ score: number, max: number } | null>(null);
  const [detailedFeedback, setDetailedFeedback] = useState<DetailedFeedback | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    // Only use saved theme; otherwise default to light
    const storedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const initialTheme: 'light' | 'dark' = storedTheme || 'light';

    setTheme(initialTheme);

    if (initialTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);


  const [assessmentHistory, setAssessmentHistory] = useState<AssessmentHistoryItem[]>([]);
  const [terminationReason, setTerminationReason] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState(true);

  // Restore Session Logic
  useEffect(() => {
    const init = async () => {
      setIsInitializing(true);
      const session = await restoreSession();
      if (session) {
        // Check status with server
        const statusCheck = await checkSessionStatus();

        if (statusCheck.status === 'TERMINATED') {
          setTerminationReason(statusCheck.reason || "Previous Session Terminated");
          setCurrentView(View.SCREENING_FAIL); // Reuse enum for ease, effectively locks app
        } else if (statusCheck.status === 'COMPLETED') {
          // Ideally show results, but we don't have them locally. 
          // Just prevent new exam.
          alert("You have already submitted this assessment.");
        }
      }
      setIsInitializing(false);
    };
    init();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J')) || (e.ctrlKey && e.key === 'u')) { e.preventDefault(); }
    };
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('contextmenu', handleContextMenu);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('contextmenu', handleContextMenu); }
  }, []);

  const toggleTheme = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);

    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };


  const startAssessment = (data: AssessmentData) => {
    setAssessmentData(data);
    setCurrentView(View.ASSESSMENT);
  };

  const handleAssessmentFinish = async (answers: Record<string, any>, timeLog: Record<number, number>) => {
    if (!assessmentData || !assessmentData.sessionId) return;
    setExamAnswers(answers);
    setCurrentView(View.RESULTS);

    try {
      const result = await submitAssessment(assessmentData.sessionId, answers, timeLog);
      setFinalScore({ score: result.score, max: result.maxScore });
      setDetailedFeedback(result.feedback);

      // Mock history update for admin view
      const reconstructedSections = assessmentData.sections.map(section => ({
        ...section,
        questions: section.questions.map(q => ({ ...q, correctAnswer: result.gradedDetails[q.id]?.correctAnswer }))
      }));
      setAssessmentHistory(prev => [...prev, { data: { ...assessmentData, sections: reconstructedSections }, answers: answers, timeLog: timeLog, timestamp: Date.now(), feedback: result.feedback, score: result.score, maxScore: result.maxScore }]);

    } catch (error) {
      console.error(error);
      alert("Server Error: Failed to submit assessment.");
    }
  };

  const resetApp = () => {
    setAssessmentData(null); setExamAnswers({}); setFinalScore(null); setDetailedFeedback(null); setCurrentView(View.DASHBOARD); setCurrentPortal('CANDIDATE');
  };

  const isSidebarVisible = currentView !== View.ASSESSMENT && currentView !== View.SCREENING_FAIL && currentView !== View.BREATHER;

  if (isInitializing) {
    return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="w-10 h-10 animate-spin text-indigo-600" /></div>;
  }

  if (currentPortal === 'ADMIN') {
    return (
      <div className="relative h-screen bg-slate-50">
        <button onClick={() => setCurrentPortal('CANDIDATE')} className="absolute top-4 left-4 z-50 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-bold flex items-center"><ArrowRight className="w-4 h-4 mr-2 rotate-180" />Back to Dashboard</button>
        <AnalyticsView data={assessmentHistory.length > 0 ? assessmentHistory[assessmentHistory.length - 1].data : null} answers={assessmentHistory.length > 0 ? assessmentHistory[assessmentHistory.length - 1].answers : {}} history={assessmentHistory} />
      </div>
    );
  }

  if (currentView === View.SCREENING_FAIL && terminationReason) {
    return <TerminatedView reason={terminationReason} />;
  }

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans overflow-hidden transition-colors">
      {isSidebarVisible && <Sidebar currentView={currentView} onViewChange={setCurrentView} />}
      <main className="flex-1 h-screen relative w-full">
        {currentView === View.DASHBOARD && <DashboardView initialData={candidateFormData} onDataChange={setCandidateFormData} onStartAssessment={startAssessment} onGoToAdmin={() => setCurrentPortal('ADMIN')} />}
        {currentView === View.ASSESSMENT && assessmentData && <ExamView sections={assessmentData.sections} onFinish={handleAssessmentFinish} />}

        {/* Loading State for Results */}
        {currentView === View.RESULTS && !finalScore && (
          <div className="h-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Calculating Results</h2>
            <p className="text-slate-500">Analyzing performance and generating feedback...</p>
          </div>
        )}

        {currentView === View.RESULTS && finalScore && <ResultsView score={finalScore.score} maxScore={finalScore.max} onReset={resetApp} feedback={detailedFeedback} />}

        {currentView === View.AI_ASSISTANT && <ChatView />}
        {currentView === View.SETTINGS && <Settings currentTheme={theme} onThemeChange={toggleTheme} />}
      </main>
    </div>
  );
};

export default App;
