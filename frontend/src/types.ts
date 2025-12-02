import React from 'react';

export enum View {
  DASHBOARD = 'DASHBOARD',
  ASSESSMENT = 'ASSESSMENT',
  BREATHER = 'BREATHER',
  RESULTS = 'RESULTS',
  SCREENING_FAIL = 'SCREENING_FAIL',
  ANALYTICS = 'ANALYTICS',
  AI_ASSISTANT = 'AI_ASSISTANT',
  SETTINGS = 'SETTINGS'
}

export interface NavItem {
  id: View;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  isError?: boolean;
}

export enum QuestionType {
  MCQ = 'MCQ',
  FITB = 'FITB',
  CODING = 'CODING'
}

export interface Question {
  id: number;
  type: QuestionType;
  text: string;
  options?: string[];
  correctAnswer?: number | string; // Optional: Never present on client during exam
  marks: number;
  subtopic?: string;
}

export interface Section {
  id: string;
  title: string;
  durationMinutes: number;
  questions: Question[];
  type: 'MODERATE_MCQ' | 'HARD_MCQ' | 'FITB' | 'CODING' | 'SCREENING';
}

export interface AssessmentData {
  sessionId?: string; // Links frontend to backend session
  jobDescription: string;
  candidateName: string;
  candidateEmail: string;
  sections: Section[];
  type?: 'SCREENING' | 'TECHNICAL';
}

export interface ExamState {
  isActive: boolean;
  currentSectionIndex: number;
  currentQuestionIndex: number;
  answers: Record<string, any>;
  questionTimeLog: Record<number, number>;
  visitedQuestionIds: number[];
  markedForReview: number[];
  warnings: number;
  remainingTime: number;
  isTerminated: boolean;
  terminationReason?: string;
  referenceImage?: string;
}

export interface DetailedFeedback {
    strengths: string[];
    weaknesses: string[];
    roadmap: string[];
    summary: string;
}

export interface AssessmentHistoryItem {
    data: AssessmentData; 
    answers: Record<string, any>;
    timeLog: Record<number, number>;
    timestamp: number;
    feedback?: DetailedFeedback;
    score?: number;
    maxScore?: number;
}

export interface ServerSubmissionResult {
    success: boolean;
    score: number;
    maxScore: number;
    feedback: DetailedFeedback;
    gradedDetails: Record<string, { isCorrect: boolean, marksAwarded: number, correctAnswer: any }>;
}
