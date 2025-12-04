
import { AssessmentData, Section, DetailedFeedback } from '../types';

const API_BASE = 'http://localhost:5000/api';

/**
 * Replaces `generateAssessmentContent` in `geminiService.ts`
 */
export const fetchSecureAssessment = async (
    jd: string, 
    name: string, 
    email: string,
    accessCode: string
): Promise<{ sessionId: string, sections: Section[] }> => {
    
    const response = await fetch(`${API_BASE}/assessment/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jd, candidateName: name, candidateEmail: email, accessCode })
    });

    if (!response.ok) throw new Error("Failed to generate assessment");
    return await response.json();
};

/**
 * Replaces `compileAndRunCode` in `geminiService.ts`
 */
export const secureCompile = async (language: string, code: string, problem: string, customInput?: string, examples?: any[]) => {
    const response = await fetch(`${API_BASE}/code/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, code, problem, customInput, examples })
    });
    return await response.json();
};

/**
 * Submits answers to server for grading.
 * Replaces local grading logic in `App.tsx`
 */
export const submitAssessment = async (
    sessionId: string,
    answers: Record<string, any>,
    timeLog: Record<number, number>
) => {
    const response = await fetch(`${API_BASE}/assessment/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, userAnswers: answers, timeLog })
    });
    return await response.json();
};
