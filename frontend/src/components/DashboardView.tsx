import React, { useState } from 'react';
import { Loader2, AlertCircle, ArrowRight, BrainCircuit, ShieldCheck, Lock, EyeOff, Wifi, FileText, Camera, MonitorX, Move, Key } from 'lucide-react';
import { generateAssessmentContent } from '../services/geminiService';
import { AssessmentData, Section } from '../types';

interface DashboardViewProps {
  initialData: { name: string; email: string; jd: string };
  onDataChange: (data: { name: string; email: string; jd: string }) => void;
  onStartAssessment: (data: AssessmentData) => void;
  onGoToAdmin: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ initialData, onDataChange, onStartAssessment, onGoToAdmin }) => {
  const [step, setStep] = useState<'INPUT' | 'CONSENT' | 'INSTRUCTIONS'>('INPUT');
  const [generatedData, setGeneratedData] = useState<{ sessionId: string, sections: Section[] } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [consentGiven, setConsentGiven] = useState(false);
  const [accessCode, setAccessCode] = useState('');

  const handleInputChange = (field: string, value: string) => {
      onDataChange({ ...initialData, [field]: value });
  };

  const handleGenerate = async () => {
    if (!initialData.name || !initialData.email || !initialData.jd || !accessCode) {
        setError("All fields including Access Code are required.");
        return;
    }

    setIsLoading(true);
    setError('');

    try {
        // Pass Access Code to verification service
        const result = await generateAssessmentContent(initialData.jd, initialData.name, initialData.email, accessCode);
        
        // Safety Check for Hydration Failure
        if (!result.sections || result.sections.length === 0 || !result.sections[0].questions) {
            throw new Error("Assessment Generation Failed: Incomplete Data. Please try again.");
        }

        setGeneratedData(result);
        setStep('CONSENT');
    } catch (err: any) {
        if (err.message && err.message.includes("403")) {
            setError("Access Denied: Invalid Email or Access Code.");
        } else if (err.message) {
            setError(err.message);
        } else {
            setError("Server Connection Failed. Please contact the administrator.");
        }
    } finally {
        setIsLoading(false);
    }
  };

  const handleConsent = () => {
      if (consentGiven) {
          setStep('INSTRUCTIONS');
      }
  };

  const handleStartFinal = () => {
      if (!generatedData) return;
      document.documentElement.requestFullscreen().catch(() => {});
      const assessmentData: AssessmentData = {
          sessionId: generatedData.sessionId,
          candidateName: initialData.name,
          candidateEmail: initialData.email,
          jobDescription: initialData.jd,
          sections: generatedData.sections,
          type: 'TECHNICAL' 
      };
      onStartAssessment(assessmentData);
  };

  if (isLoading) {
    return (
        <div className="h-full flex flex-col items-center justify-center bg-slate-50 p-8 text-center">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Verifying Credentials</h2>
            <p className="text-slate-500">Generating 30-Question Assessment & Validating Access Code...</p>
        </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6 md:p-12 relative">
      <button onClick={onGoToAdmin} className="absolute top-6 left-6 flex items-center space-x-2 px-3 py-2 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-colors text-sm font-medium"><ShieldCheck className="w-4 h-4" /><span>Admin Console</span></button>

      <div className="max-w-4xl mx-auto mt-6">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
            <div className="p-8 space-y-6">
                
                {/* STEP 1: INPUT */}
                {step === 'INPUT' && (
                    <>
                         <div className="text-center mb-8"><h1 className="text-3xl font-bold text-slate-900">eVALUEate Assessment Portal</h1></div>
                         <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl flex items-start space-x-3 mb-4">
                            <Lock className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" />
                            <div className="text-sm text-indigo-900"><strong>Access Control Active:</strong> Assessment is restricted to authorized candidates only.</div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2"><label className="text-sm font-semibold">Name</label><input type="text" className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 transition-all" value={initialData.name} onChange={e => handleInputChange('name', e.target.value)} /></div>
                            <div className="space-y-2"><label className="text-sm font-semibold">Registered Email</label><input type="email" placeholder="e.g. candidate@evalueate.com" className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 transition-all" value={initialData.email} onChange={e => handleInputChange('email', e.target.value)} /></div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold">Access Code</label>
                                <div className="relative">
                                    <Key className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                                    <input 
                                        type="password" 
                                        placeholder="e.g. EVAL2025" 
                                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 transition-all" 
                                        value={accessCode} 
                                        onChange={e => setAccessCode(e.target.value)} 
                                    />
                                </div>
                            </div>
                             <div className="space-y-2"><label className="text-sm font-semibold">Target Role (Job Description)</label><input type="text" placeholder="e.g. Senior React Developer" className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 transition-all" value={initialData.jd} onChange={e => handleInputChange('jd', e.target.value)} /></div>
                        </div>
                        
                        {error && <div className="p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl flex items-center space-x-3 text-sm animate-in slide-in-from-top-2"><AlertCircle className="w-5 h-5" /><span>{error}</span></div>}
                        <button onClick={handleGenerate} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-lg flex items-center justify-center space-x-2 transition-all transform hover:scale-[1.01]"><span>Verify Credentials & Start</span><ArrowRight className="w-5 h-5" /></button>
                    </>
                )}

                {/* STEP 2: CONSENT */}
                {step === 'CONSENT' && (
                     <div className="animate-in fade-in slide-in-from-right-4">
                        <div className="text-center mb-8">
                            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <FileText className="w-8 h-8 text-indigo-600" />
                            </div>
                            <h2 className="text-2xl font-bold text-slate-900">Data Collection Consent</h2>
                            <p className="text-slate-500 mt-2">Please review how we capture data to ensure exam integrity.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                            <div className="p-4 border border-slate-200 rounded-xl flex items-start space-x-3 hover:bg-slate-50 transition-colors">
                                <Camera className="w-6 h-6 text-indigo-500 mt-1" />
                                <div>
                                    <h4 className="font-semibold text-slate-800">Video & Audio Recording</h4>
                                    <p className="text-xs text-slate-500 mt-1">Continuous webcam and microphone feed to monitor the candidate's environment.</p>
                                </div>
                            </div>
                             <div className="p-4 border border-slate-200 rounded-xl flex items-start space-x-3 hover:bg-slate-50 transition-colors">
                                <MonitorX className="w-6 h-6 text-indigo-500 mt-1" />
                                <div>
                                    <h4 className="font-semibold text-slate-800">Screen Activity</h4>
                                    <p className="text-xs text-slate-500 mt-1">Detection of tab switching, window minimization, and focus loss events.</p>
                                </div>
                            </div>
                             <div className="p-4 border border-slate-200 rounded-xl flex items-start space-x-3 hover:bg-slate-50 transition-colors">
                                <Move className="w-6 h-6 text-indigo-500 mt-1" />
                                <div>
                                    <h4 className="font-semibold text-slate-800">Motion Analysis</h4>
                                    <p className="text-xs text-slate-500 mt-1">AI-based analysis of candidate movement and presence verification.</p>
                                </div>
                            </div>
                             <div className="p-4 border border-slate-200 rounded-xl flex items-start space-x-3 hover:bg-slate-50 transition-colors">
                                <Wifi className="w-6 h-6 text-indigo-500 mt-1" />
                                <div>
                                    <h4 className="font-semibold text-slate-800">Device Fingerprinting</h4>
                                    <p className="text-xs text-slate-500 mt-1">Collection of IP address and system details to prevent identity fraud.</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl mb-6">
                            <label className="flex items-center space-x-3 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    className="w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                    checked={consentGiven}
                                    onChange={(e) => setConsentGiven(e.target.checked)}
                                />
                                <span className="text-sm font-medium text-slate-700 select-none">
                                    I hereby explicitly consent to the collection, processing, and storage of my data as described above for the purpose of proctoring this assessment.
                                </span>
                            </label>
                        </div>

                        <button 
                            onClick={handleConsent} 
                            disabled={!consentGiven}
                            className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center space-x-2 transition-all ${consentGiven ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                        >
                            <span>Agree & Continue</span>
                            <ArrowRight className="w-5 h-5" />
                        </button>
                     </div>
                )}

                {/* STEP 3: INSTRUCTIONS */}
                {step === 'INSTRUCTIONS' && (
                    <div className="animate-in fade-in slide-in-from-right-4">
                        <h3 className="text-xl font-bold mb-6 flex items-center"><BrainCircuit className="w-6 h-6 mr-2 text-indigo-600" /> Exam Rules & Instructions</h3>
                        
                        <div className="space-y-4 mb-8">
                             {/* STRICT RULE: TAB SWITCHING */}
                            <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl flex items-start space-x-3">
                                <MonitorX className="w-6 h-6 text-rose-600 flex-shrink-0 mt-0.5" />
                                <div>
                                    <h4 className="font-bold text-rose-900">Strict Focus Policy</h4>
                                    <p className="text-sm text-rose-800 mt-1">
                                        <strong>Switching tabs or minimizing the window is prohibited.</strong> Any loss of window focus will be logged as a violation and may lead to termination.
                                    </p>
                                </div>
                            </div>

                             {/* STRICT RULE: MOTION */}
                            <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl flex items-start space-x-3">
                                <Move className="w-6 h-6 text-rose-600 flex-shrink-0 mt-0.5" />
                                <div>
                                    <h4 className="font-bold text-rose-900">Motion & Environment Monitoring</h4>
                                    <p className="text-sm text-rose-800 mt-1">
                                        <strong>Any suspicious motion detected will be captured.</strong> Please stay within the camera frame at all times. Multiple people in the frame is a violation.
                                    </p>
                                </div>
                            </div>

                             {/* EXTENSION WARNING */}
                            <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl flex items-start space-x-3">
                                <EyeOff className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
                                <div>
                                    <h4 className="font-bold text-amber-900">Zero Tolerance: Extensions</h4>
                                    <p className="text-sm text-amber-800 mt-1">
                                        Extensions like Grammarly, Translators, or AI assistants detected in the browser will trigger an immediate ban.
                                    </p>
                                </div>
                            </div>

                            {/* NETWORK WARNING */}
                            <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start space-x-3">
                                <Wifi className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
                                <div>
                                    <h4 className="font-bold text-blue-900">IP Binding Active</h4>
                                    <p className="text-sm text-blue-800 mt-1">
                                        Your session is locked to your IP. Do not switch networks during the exam.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex space-x-4">
                            <button onClick={() => setStep('CONSENT')} className="flex-1 py-4 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-colors">Back</button>
                            <button onClick={handleStartFinal} className="flex-[2] py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:shadow-indigo-500/25 transition-all hover:bg-indigo-700">Start Assessment</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};