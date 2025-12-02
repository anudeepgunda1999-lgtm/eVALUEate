import React from 'react';
import { XCircle, LogOut } from 'lucide-react';

export const ScreeningFailView: React.FC<{ score: number, onHome: () => void }> = ({ score, onHome }) => {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-slate-50 p-8 text-center animate-in fade-in duration-500">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-100 p-10">
        <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <XCircle className="w-10 h-10 text-rose-500" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Assessment Ended</h1>
        <p className="text-slate-500 mb-8">
            Thank you for participating in the Phase 1 Screening.
        </p>
        
        <div className="bg-slate-50 rounded-xl p-6 mb-8 border border-slate-100">
            <div className="text-sm text-slate-500 font-medium uppercase tracking-wide mb-1">Your Score</div>
            <div className="text-3xl font-bold text-slate-800">{score} / 30</div>
            <div className="mt-2 text-xs text-rose-500 font-medium flex items-center justify-center">
                <span>Required to Qualify: &gt; 20</span>
            </div>
        </div>

        <p className="text-sm text-slate-400 mb-8 leading-relaxed">
            Unfortunately, you did not meet the minimum qualifying criteria to proceed to the Technical Assessment round. We appreciate your time and interest.
        </p>

        <button 
            onClick={onHome}
            className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors flex items-center justify-center space-x-2"
        >
            <LogOut className="w-4 h-4" />
            <span>Return to Home</span>
        </button>
      </div>
    </div>
  );
};