
import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, EyeOff, Terminal, Loader2, PlayCircle, RefreshCw, Maximize2, Minimize2, Keyboard } from 'lucide-react';
import { Section, ExamState } from '../types';
import { compileAndRunCode, sendHeartbeat, triggerSectionGeneration } from '../services/geminiService';

interface ExamViewProps {
  sections: Section[];
  onFinish: (answers: Record<string, any>, timeLog: Record<number, number>) => void;
}

const SUPPORTED_LANGUAGES = ['javascript', 'python', 'java', 'cpp', 'csharp', 'go', 'ruby', 'react', 'nodejs', 'sql'];

export const ExamView: React.FC<ExamViewProps> = ({ sections: initialSections, onFinish }) => {
  // --- EFFECT: HOOKS MOVED TO TOP ---
  const [sections, setSections] = useState<Section[]>(initialSections);
  const [examState, setExamState] = useState<ExamState>({
    isActive: false, 
    currentSectionIndex: 0,
    currentQuestionIndex: 0,
    answers: {},
    questionTimeLog: {},
    visitedQuestionIds: [],
    markedForReview: [],
    warnings: 0,
    remainingTime: initialSections[0]?.durationMinutes * 60 || 0,
    isTerminated: false,
    terminationReason: '',
    referenceImage: undefined,
  });

  const [isWindowFocused, setIsWindowFocused] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [isSystemCheckPassed, setIsSystemCheckPassed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [compilerOutput, setCompilerOutput] = useState<{status: string, output: string} | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [code, setCode] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('javascript');
  const [showRetry, setShowRetry] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const outputEndRef = useRef<HTMLDivElement>(null);

  // Track which sections we have already requested to generate
  const fetchedSections = useRef<Set<string>>(new Set());

  // Helper to trigger generation
  const triggerFetch = (sectionId: string) => {
      if (fetchedSections.current.has(sectionId)) return;
      fetchedSections.current.add(sectionId);
      setShowRetry(false);
      
      triggerSectionGeneration(sectionId).then(qs => {
          setSections(prev => {
              const copy = [...prev];
              const idx = copy.findIndex(s => s.id === sectionId);
              if (idx !== -1) {
                  // Deduplicate questions just in case
                  const uniqueQs = qs.filter((q, index, self) => 
                      index === self.findIndex((t) => (t.text === q.text))
                  );
                  copy[idx] = { ...copy[idx], questions: uniqueQs, isPending: false };
              }
              return copy;
          });
      }).catch(err => {
          console.error("Generation failed, retrying in 5s...", err);
          fetchedSections.current.delete(sectionId); // Allow retry
          setTimeout(() => setShowRetry(true), 5000);
      });
  };

  // --- EFFECT 1: PREFETCHING & ON-DEMAND GENERATION ---
  useEffect(() => {
      if (!isSystemCheckPassed) return;
      
      const currentSection = sections[examState.currentSectionIndex];
      // Safety check if section is undefined (e.g. during transitions)
      if (!currentSection) return;

      const sectionDurationSeconds = currentSection.durationMinutes * 60;
      const elapsedTime = sectionDurationSeconds - examState.remainingTime;

      // RULE 1: PREFETCH Section 2 (FITB) if we are in Section 1 and 25 mins have passed
      if (currentSection.id === 's1-mcq' && elapsedTime >= 1500 && !fetchedSections.current.has('s2-fitb')) {
          console.log("Time-based Trigger: Generating Section 2...");
          triggerFetch('s2-fitb');
      }

      // RULE 2: PREFETCH Section 3 (Coding) if we are in Section 2 and 1 minute has passed
      if (currentSection.id === 's2-fitb' && elapsedTime >= 60 && !fetchedSections.current.has('s3-coding')) {
          console.log("Time-based Trigger: Generating Section 3...");
          triggerFetch('s3-coding');
      }
      
      // RULE 3 (THE FIX): If we land on a pending section (e.g., finished S1 early), generate IMMEDIATELY
      if (currentSection.isPending && !fetchedSections.current.has(currentSection.id)) {
          console.log(`On-Entry Trigger: Force Generating ${currentSection.id}...`);
          triggerFetch(currentSection.id);
      }

  }, [examState.remainingTime, examState.currentSectionIndex, isSystemCheckPassed, sections]);

  // --- EFFECT 2: Sync code editor state ---
  useEffect(() => {
    if (sections[examState.currentSectionIndex]?.questions?.[examState.currentQuestionIndex]) {
        const qId = sections[examState.currentSectionIndex].questions[examState.currentQuestionIndex].id;
        setCode(examState.answers[qId] || '');
        setCompilerOutput(null);
        setCustomInput(''); // Reset custom input on question change
        setShowCustomInput(false);
    }
  }, [examState.currentQuestionIndex, examState.currentSectionIndex, sections]);

  // --- EFFECT 3: Timer Logic ---
  useEffect(() => {
    // FIX: Don't run timer if section is pending
    const isPending = sections[examState.currentSectionIndex]?.isPending;

    if (examState.isActive && !examState.isTerminated && isSystemCheckPassed && !isPending) {
      const timer = setInterval(() => {
        setExamState(prev => {
          if (prev.remainingTime <= 0) {
              if (prev.currentSectionIndex < sections.length - 1) {
                  // Move to next section
                  return { 
                      ...prev, 
                      currentSectionIndex: prev.currentSectionIndex + 1, 
                      currentQuestionIndex: 0, 
                      remainingTime: sections[prev.currentSectionIndex + 1].durationMinutes * 60 
                  };
              } else {
                  // Finish Exam
                  if(!isSubmitting) {
                      setIsSubmitting(true);
                      onFinish(prev.answers, prev.questionTimeLog);
                  }
                  return prev;
              }
          }
          return { ...prev, remainingTime: prev.remainingTime - 1 };
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [examState.isActive, examState.isTerminated, isSystemCheckPassed, sections, isSubmitting, examState.currentSectionIndex]);

  // --- EFFECT 4: Fullscreen Security ---
  useEffect(() => {
      const handleFullscreen = () => { setIsFullscreen(!!document.fullscreenElement); if (!document.fullscreenElement && examState.isActive) handleViolation('fullscreen_exit'); };
      document.addEventListener('fullscreenchange', handleFullscreen);
      return () => document.removeEventListener('fullscreenchange', handleFullscreen);
  }, [examState.isActive]);
  
  // --- EFFECT 5: Focus Security ---
  useEffect(() => {
    const handleBlur = () => { setIsWindowFocused(false); if (examState.isActive) handleViolation('tab_switch_detected'); };
    const handleFocus = () => { setIsWindowFocused(true); };
    window.addEventListener('blur', handleBlur); window.addEventListener('focus', handleFocus);
    return () => { window.removeEventListener('blur', handleBlur); window.removeEventListener('focus', handleFocus); };
  }, [examState.isActive]);

  // --- EFFECT 6: Auto-scroll output ---
  useEffect(() => {
      if (outputEndRef.current && compilerOutput) {
          outputEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
  }, [compilerOutput]);

  const handleViolation = (type: string) => { 
      if (!examState.isActive || examState.isTerminated) return; 
      sendHeartbeat(type); 
      // Show audible/visual warning?
      console.warn("PROCTORING ALERT: " + type);
      
      if(type === 'tab_switch_detected') {
          setExamState(prev => { 
              const w = prev.warnings + 1; 
              return w >= 2 ? { ...prev, isTerminated: true, terminationReason: "Assessment Terminated: Focus Loss (Alt-Tab/Minimize)" } : { ...prev, warnings: w }; 
          });
      }
  };

  const startExam = () => {
      setIsSystemCheckPassed(true);
      setExamState(p => ({ ...p, isActive: true }));
      document.documentElement.requestFullscreen().catch(()=>{});
  };

  const handleInput = (qId: number, val: string) => {
      setCode(val);
      setExamState(p => ({ ...p, answers: { ...p.answers, [qId]: val } }));
  };
  
  // Handlers for Tab Indentation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, qId: number) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      // Insert 2 spaces
      const newValue = code.substring(0, start) + "  " + code.substring(end);
      
      setCode(newValue);
      setExamState(p => ({ ...p, answers: { ...p.answers, [qId]: newValue } }));
      
      // Move cursor
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  const runCode = async () => {
      const currentSection = sections[examState.currentSectionIndex];
      const currentQuestion = currentSection.questions[examState.currentQuestionIndex];
      
      setIsCompiling(true);
      setCompilerOutput({ status: 'Running', output: 'Compiling code on remote server...' });
      
      try { 
          // Pass custom input if toggle is open
          const inputToRun = showCustomInput ? customInput : undefined;
          // PASS FIXED EXAMPLES to ensure consistency
          const examples = currentQuestion.examples || [];
          const res = await compileAndRunCode(selectedLanguage, code, currentQuestion.text, inputToRun, examples); 
          setCompilerOutput({status: 'Success', output: res.output}); 
      } catch(e) {
          setCompilerOutput({status: 'Error', output: "Compilation Service Unavailable"});
      } finally { 
          setIsCompiling(false); 
      }
  };
  
  const getCommentPrefix = (lang: string) => {
    if (lang === 'sql') return '--';
    if (lang === 'python' || lang === 'ruby') return '#';
    return '//';
  };

  // --- EARLY RETURNS (Conditionals) ---

  if (examState.isTerminated) return <div className="h-full flex items-center justify-center bg-rose-950 text-white flex-col"><AlertTriangle className="w-24 h-24 mb-6 text-rose-500" /><h1 className="text-4xl font-bold mb-2">SESSION TERMINATED</h1><p className="text-xl text-rose-200">{examState.terminationReason}</p></div>;
  if (!isWindowFocused || !isFullscreen) return <div className="absolute inset-0 z-50 bg-slate-900 text-white flex items-center justify-center flex-col"><EyeOff className="w-16 h-16 mb-6 text-indigo-500" /><h1 className="text-3xl font-bold mb-2">Proctoring Lock</h1><p className="text-slate-400 mb-8">Please return to fullscreen to continue your assessment.</p><button onClick={() => document.documentElement.requestFullscreen()} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold shadow-lg transition-all">Resume Assessment</button></div>;
  
  // PRE-START SCREEN
  if (!isSystemCheckPassed) return (
    <div className="h-full flex flex-col items-center justify-center bg-slate-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
        <div className="z-10 text-center max-w-lg">
            <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-indigo-500/30">
                <PlayCircle className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-bold mb-4 tracking-tight">Ready to Begin?</h1>
            <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 backdrop-blur-sm mb-8">
                <div className="flex justify-between text-sm mb-2"><span className="text-slate-400">Section 1</span><span className="font-bold">MCQ (30m)</span></div>
                <div className="flex justify-between text-sm mb-2"><span className="text-slate-400">Section 2</span><span className="font-bold">Technical FITB (5m)</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-400">Section 3</span><span className="font-bold">Advanced Coding (40m)</span></div>
            </div>
            <button onClick={startExam} className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-lg shadow-xl shadow-emerald-900/20 transition-all transform hover:scale-[1.02]">Enter Secure Environment</button>
        </div>
    </div>
  );

  const currentSection = sections[examState.currentSectionIndex];
  
  // Pending State (Waiting for generation)
  if (!currentSection || currentSection.isPending) {
      return (
          <div className="flex flex-col items-center justify-center h-full bg-slate-900 text-white animate-in fade-in duration-500">
              <Loader2 className="w-16 h-16 text-indigo-500 animate-spin mb-6" />
              <h2 className="text-3xl font-bold">Generating Next Module</h2>
              <p className="text-slate-400 mt-4 max-w-md text-center">
                  Our AI is curating {currentSection?.title || 'questions'} based on your profile. This usually takes 10-20 seconds.
              </p>
              
              {showRetry && (
                  <button 
                      onClick={() => {
                           if (currentSection) {
                               fetchedSections.current.delete(currentSection.id);
                               triggerFetch(currentSection.id);
                           }
                      }}
                      className="mt-8 px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded-full text-sm font-bold transition-colors flex items-center"
                  >
                      <RefreshCw className="w-4 h-4 mr-2" /> Retry Generation
                  </button>
              )}
          </div>
      );
  }

  const currentQuestion = currentSection.questions[examState.currentQuestionIndex];
  
  // Handle empty question lists gracefully
  if (!currentQuestion) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-slate-500">
             <AlertTriangle className="w-10 h-10 mb-2 text-amber-500" />
             <p>Data Synchronization Error. Please wait...</p>
        </div>
      );
  }

  const renderCoding = () => (
      <div className="flex flex-col h-full bg-[#1e1e1e] text-slate-300">
          <div className="flex-1 flex overflow-hidden">
              {/* LEFT PANEL: PROBLEM */}
              <div className="w-1/3 border-r border-slate-700 p-6 overflow-y-auto bg-[#1e1e1e]">
                  <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-3 block">Problem Statement</span>
                  <div className="text-lg font-medium text-white mb-6 leading-relaxed whitespace-pre-wrap">
                      {currentQuestion.text}
                  </div>
                  <div className="space-y-4 text-sm text-slate-400">
                      <div className="bg-[#2d2d2d] p-4 rounded border border-slate-700">
                          <span className="text-xs text-slate-500 block mb-2 font-bold uppercase">Constraint Guidelines:</span>
                          <ul className="list-disc pl-4 space-y-1">
                              <li>Optimize for Time Complexity: O(n log n)</li>
                              <li>Optimize for Space Complexity: O(n)</li>
                              <li>Handle large inputs gracefully</li>
                          </ul>
                      </div>
                  </div>
              </div>

              {/* RIGHT PANEL: EDITOR + TERMINAL */}
              <div className="w-2/3 flex flex-col relative">
                  {/* EDITOR TOOLBAR */}
                  <div className="bg-[#252526] h-12 flex items-center justify-between px-4 border-b border-[#333]">
                      <div className="flex items-center space-x-2">
                          <Terminal className="w-4 h-4 text-indigo-400" />
                          <span className="text-xs font-bold text-slate-300">CODE EDITOR</span>
                      </div>
                      <div className="flex items-center space-x-4">
                           <div className="flex items-center space-x-2">
                               <span className="text-xs text-slate-500">Language:</span>
                               <select 
                                  value={selectedLanguage}
                                  onChange={(e) => setSelectedLanguage(e.target.value)}
                                  className="bg-[#333] text-slate-200 text-xs px-2 py-1.5 rounded border border-[#444] outline-none focus:border-indigo-500"
                               >
                                  {SUPPORTED_LANGUAGES.map(lang => (
                                      <option key={lang} value={lang}>{lang.charAt(0).toUpperCase() + lang.slice(1)}</option>
                                  ))}
                               </select>
                           </div>
                           <span className={`text-[10px] flex items-center px-2 py-1 rounded ${examState.answers[currentQuestion.id] && examState.answers[currentQuestion.id].trim() !== '' ? 'bg-emerald-900/30 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                               {examState.answers[currentQuestion.id] && examState.answers[currentQuestion.id].trim() !== '' ? 'Saved' : 'Unsaved'}
                           </span>
                      </div>
                  </div>
                  
                  {/* TEXTAREA AREA */}
                  <div className="flex-1 flex relative overflow-hidden">
                      <div className="w-12 bg-[#1e1e1e] border-r border-[#333] pt-4 text-right pr-3 text-slate-600 text-xs font-mono select-none">
                          {Array.from({length: 99}).map((_, i) => <div key={i}>{i+1}</div>)}
                      </div>
                      <textarea 
                          value={code} 
                          onChange={e => handleInput(currentQuestion.id, e.target.value)} 
                          onKeyDown={e => handleKeyDown(e, currentQuestion.id)}
                          className="flex-1 bg-[#1e1e1e] p-4 font-mono text-sm outline-none resize-none leading-relaxed text-slate-200" 
                          spellCheck={false}
                          placeholder={`${getCommentPrefix(selectedLanguage)} Type your ${selectedLanguage} solution here...`}
                      />
                  </div>

                  {/* TERMINAL OUTPUT PANEL */}
                  <div className={`bg-[#1e1e1e] border-t-2 border-[#333] flex flex-col relative transition-all duration-300 ${showCustomInput ? 'h-72' : 'h-56'}`}>
                      <div className="px-6 py-3 bg-[#252526] text-xs text-slate-400 font-bold uppercase tracking-wider flex justify-between items-center border-b border-[#333]">
                          <div className="flex items-center space-x-4">
                              <span>Output Terminal</span>
                               {/* START RUN BUTTON (BOTTOM LEFT) - ENHANCED VISIBILITY */}
                               <button 
                                    onClick={runCode} 
                                    disabled={isCompiling} 
                                    className="flex items-center space-x-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded shadow-lg shadow-emerald-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105"
                                >
                                    {isCompiling ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                                    <span>{isCompiling ? 'Running...' : 'Run Code'}</span>
                                </button>
                                {/* END RUN BUTTON */}
                          </div>
                          <div className="flex items-center space-x-4">
                              <label className="flex items-center space-x-2 cursor-pointer hover:text-white transition-colors p-1 rounded hover:bg-[#333]">
                                  <input 
                                    type="checkbox" 
                                    checked={showCustomInput} 
                                    onChange={e => setShowCustomInput(e.target.checked)}
                                    className="w-4 h-4 rounded border-slate-500 bg-[#333] text-indigo-500 focus:ring-offset-0 focus:ring-0"
                                  />
                                  <span className="flex items-center font-medium"><Keyboard className="w-4 h-4 mr-2"/> Custom Input</span>
                              </label>
                              {compilerOutput && <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${compilerOutput.status === 'Success' ? 'bg-emerald-900/30 text-emerald-400' : 'bg-rose-900/30 text-rose-400'}`}>{compilerOutput.status.toUpperCase()}</span>}
                          </div>
                      </div>
                      
                      {showCustomInput && (
                          <div className="p-3 bg-[#1e1e1e] border-b border-[#333] animate-in slide-in-from-top-2">
                              <textarea 
                                  value={customInput}
                                  onChange={e => setCustomInput(e.target.value)}
                                  className="w-full h-20 bg-[#252526] text-slate-300 p-3 text-xs font-mono outline-none border border-[#444] rounded resize-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                  placeholder="Enter your custom input here..."
                              />
                          </div>
                      )}

                      <pre className="flex-1 p-4 font-mono text-xs overflow-y-auto text-slate-300 whitespace-pre-wrap bg-[#1e1e1e]">
                          {compilerOutput?.output || '> Waiting for execution...'}
                          <div ref={outputEndRef} />
                      </pre>
                  </div>
              </div>
          </div>
      </div>
  );

  return (
      <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white transition-colors duration-300">
          {/* Header */}
          <div className="h-16 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center px-6 bg-white dark:bg-slate-900 shadow-sm z-20">
              <div className="flex items-center space-x-4">
                  <div className="h-8 w-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">{examState.currentSectionIndex + 1}</div>
                  <h2 className="font-bold text-lg">{currentSection.title}</h2>
              </div>
              <div className={`font-mono text-lg font-bold px-4 py-1 rounded-lg border ${examState.remainingTime < 300 ? 'bg-rose-50 text-rose-600 border-rose-200 animate-pulse' : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                  {Math.floor(examState.remainingTime/60)}:{String(examState.remainingTime%60).padStart(2,'0')}
              </div>
          </div>
          
          <div className="flex-1 overflow-hidden relative">
              {currentQuestion.type === 'CODING' ? renderCoding() : (
                  <div className="flex h-full">
                       {/* Sidebar for Navigation */}
                       <div className="w-72 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-6 overflow-y-auto hidden md:block">
                           <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Question Navigator</h4>
                           <div className="grid grid-cols-4 gap-3 content-start">
                               {currentSection.questions.map((q, i) => (
                                   <button 
                                      key={q.id} 
                                      onClick={() => setExamState(p => ({...p, currentQuestionIndex: i}))} 
                                      className={`h-10 rounded-lg font-bold text-sm transition-all ${
                                          i === examState.currentQuestionIndex 
                                              ? 'bg-indigo-600 text-white shadow-md transform scale-105' 
                                              : examState.answers[q.id] !== undefined
                                                  ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' 
                                                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:border-indigo-300'
                                      }`}
                                   >
                                       {i+1}
                                   </button>
                               ))}
                           </div>
                       </div>

                       {/* Question Area */}
                       <div className="flex-1 p-8 md:p-12 overflow-y-auto bg-white dark:bg-slate-900">
                           <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-right-4 duration-300" key={currentQuestion.id}>
                               <span className="inline-block px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-bold rounded-full mb-4">
                                   Question {examState.currentQuestionIndex + 1} of {currentSection.questions.length}
                               </span>
                               {/* UPDATED: Changed from font-bold to font-medium to reduce visual weight */}
                               <h3 className="text-2xl font-medium mb-8 leading-snug">{currentQuestion.text}</h3>
                               
                               {currentQuestion.type === 'MCQ' ? (
                                   <div className="space-y-4">
                                       {currentQuestion.options?.map((opt, i) => (
                                       <div 
                                          key={i} 
                                          onClick={() => setExamState(p => ({...p, answers: {...p.answers, [currentQuestion.id]: i}}))} 
                                          className={`group p-5 rounded-xl border-2 cursor-pointer transition-all flex items-center space-x-4 ${
                                              examState.answers[currentQuestion.id] === i 
                                                  ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' 
                                                  : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                                          }`}
                                       >
                                           <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                               examState.answers[currentQuestion.id] === i ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'
                                           }`}>
                                               {examState.answers[currentQuestion.id] === i && <div className="w-2 h-2 bg-white rounded-full" />}
                                           </div>
                                           <span className={`font-medium ${examState.answers[currentQuestion.id] === i ? 'text-indigo-900 dark:text-indigo-100' : 'text-slate-700 dark:text-slate-300'}`}>{opt}</span>
                                       </div>
                                   ))}
                                   </div>
                               ) : (
                                   <div className="space-y-4">
                                       <label className="block text-sm font-medium text-slate-500">Your Answer</label>
                                       <input 
                                          className="w-full p-5 border-2 border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all bg-transparent font-medium" 
                                          placeholder="Type your answer here..." 
                                          value={examState.answers[currentQuestion.id] || ''} 
                                          onChange={e => handleInput(currentQuestion.id, e.target.value)} 
                                          autoFocus
                                       />
                                   </div>
                               )}
                           </div>
                       </div>
                  </div>
              )}
          </div>

          {/* Footer Controls */}
          {/* UNIFIED FOOTER: Always show navigation controls */}
          <div className="h-20 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between px-6 z-20">
               <button 
                  onClick={() => setExamState(p => ({...p, currentQuestionIndex: Math.max(0, p.currentQuestionIndex - 1)}))} 
                  disabled={examState.currentQuestionIndex === 0} 
                  className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
               >
                  Previous
               </button>
              
               <button 
                  onClick={() => {
                      if (examState.currentQuestionIndex < currentSection.questions.length - 1) {
                          setExamState(p => ({...p, currentQuestionIndex: p.currentQuestionIndex + 1}));
                      } else {
                          // Next Section Logic
                           if (examState.currentSectionIndex < sections.length - 1) {
                              setExamState(prev => ({ 
                                  ...prev, 
                                  currentSectionIndex: prev.currentSectionIndex + 1, 
                                  currentQuestionIndex: 0, 
                                  remainingTime: sections[prev.currentSectionIndex + 1].durationMinutes * 60 
                              }));
                           } else {
                              if (!isSubmitting) {
                                  setIsSubmitting(true);
                                  onFinish(examState.answers, examState.questionTimeLog);
                              }
                           }
                      }
                  }}
                  disabled={isSubmitting}
                  className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/30 transition-all flex items-center space-x-2"
               >
                  {isSubmitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Submitting...</span>
                      </>
                  ) : (
                      <span>{examState.currentQuestionIndex === currentSection.questions.length - 1 ? (examState.currentSectionIndex === sections.length - 1 ? 'Finish Assessment' : 'Next Section') : 'Next Question'}</span>
                  )}
               </button>
          </div>
      </div>
  );
};
