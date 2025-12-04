const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');
const { v4: uuidv4 } = require('uuid');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'evalueate-secure-key-2025';

const API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY;

if (!API_KEY) {
    console.error("CRITICAL: GEMINI_API_KEY missing.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

// ADMIN CREDENTIALS
const ADMIN_DIRECTORY = {
    'admin': 'admin', 
    'hr_lead': 'secure_hiring'
};

// CANDIDATE CREDENTIALS (ALLOWED USERS)
const CANDIDATE_DIRECTORY = {
    'candidate@evalueate.com': 'EVAL2025',
    'test@user.com': 'TEST1234',
    'student@university.edu': 'EXAM2024',
    'saikiranadhi15@gmail.com': 'SAIKIRAN2024',
    'akhilbalajiendla@gmail.com': 'AKHIL2024',
    'rohandubyala@gmail.com': 'ROHAN2024',
    'pavankatherashala345@gmail.com': 'PAVAN2024',
    'yashwanthsukumarv@gmail.com': 'YASH2024',
    'pakasriteja2021@gmail.com': 'TEJA2024',
    'mandalatony123@gmail.com': 'TONY2024',
    'vangariushasree041@gmail.com': 'USHASREE2024',
    'borigamsaicharanya27@gmail.com': 'CHARANYA2024',
    'namanipragna@gmail.com': 'PRAGNA2024',
    'manognasadula28@gmail.com': 'MANOGNA2024',
    'k.chanakya2004@gmail.com': 'CHANAKYA2024'
};


// TRACK ACCESS STATE (True = Locked/Used, False/Undefined = Active)
const CANDIDATE_ACCESS_STATE = new Map();

app.use(helmet());
app.use(cors({ origin: '*', methods: ['POST', 'GET'] })); 
app.use(express.json({ limit: '10mb' }));

const SESSION_STORE = new Map(); 

// --- UTILS ---
const cleanJSON = (text) => {
    if (!text) return "[]";
    let cleaned = text.replace(/```json/g, '').replace(/```/g, '');
    const firstBrace = cleaned.indexOf('{');
    const firstSquare = cleaned.indexOf('[');
    let startIdx = -1;
    if (firstBrace !== -1 && (firstSquare === -1 || firstBrace < firstSquare)) startIdx = firstBrace;
    else if (firstSquare !== -1) startIdx = firstSquare;

    if (startIdx !== -1) {
        const lastBrace = cleaned.lastIndexOf('}');
        const lastSquare = cleaned.lastIndexOf(']');
        const endIdx = Math.max(lastBrace, lastSquare);
        if (endIdx !== -1) cleaned = cleaned.substring(startIdx, endIdx + 1);
    }
    return cleaned.trim();
};

const generateToken = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: '4h' });

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ error: "Invalid Token" });
        req.user = decoded;
        next();
    });
};

// --- OPTIMIZED PROMPTS (COMPACT JSON) ---

const PROMPT_S1_MCQ = (jd) => `
Generate exactly 30 Hard MCQs for a technical assessment.
DISTRIBUTION:
- 10 Questions MUST cover Core CS Fundamentals: DSA, SQL, DBMS, Operating Systems, Networks, Software Engineering.
- 20 Questions MUST cover the specific Job Description: "${jd.substring(0, 300)}".

Formatting Rules:
1. Do NOT make the entire question bold. Use normal text weight.
2. Do NOT use asterisks (*) or markdown bolding for ANY words. Output plain text only.
3. Return Compact JSON Array.

Keys: 
"q": Question text (Plain text)
"o": Array of 4 options
"a": Correct Option Index (0-3)
"m": Marks (default 1)
Strictly valid JSON. No Markdown.
`;

const PROMPT_S2_FITB = (jd) => `
Generate 10 DISTINCT and UNIQUE Technical Fill-in-the-Blank questions.
DISTRIBUTION:
- 5 Questions MUST cover Core CS Fundamentals (DSA, DBMS, OS, Networks).
- 5 Questions MUST cover: "${jd.substring(0, 300)}".

Formatting Rules:
1. Ensure every question is unique. Do not repeat concepts.
2. Do NOT make the entire question bold.
3. Do NOT use asterisks (*) or markdown bolding.
4. Use '___' for the blank.

Format: JSON Array.
Keys: "id", "type": "FITB", "text", "correctAnswer", "marks": 2.
Strictly valid JSON. No Markdown.
`;

const PROMPT_S3_CODING = (jd) => `
Generate EXACTLY 2 distinct LeetCode Hard/Medium Coding Problems.
DISTRIBUTION:
- Question 1: Pure Data Structures & Algorithms (DSA) - e.g., Graph, Tree, DP, Trie.
- Question 2: Job Description Specific Scenario related to: "${jd.substring(0, 300)}".

Formatting Rules:
1. Split the Problem Statement into 2-3 distinct paragraphs using newlines (\\n\\n).
2. If the problem requires SQL, you MUST provide the Table Schema (Table Name, Columns, Data Types) clearly in the problem description.
3. **MANDATORY**: Provide 2 Sample Test Cases as a structured 'examples' array, NOT in the text.
4. Do NOT make the entire text bold.
5. Do NOT use asterisks (*) or markdown bolding for ANY words. Output plain text only.

Format: JSON ARRAY containing exactly 2 objects.
[
  { 
    "type": "CODING", 
    "text": "DSA Problem description here...", 
    "examples": [
       { "input": "...", "output": "..." },
       { "input": "...", "output": "..." }
    ],
    "marks": 25 
  },
  { 
    "type": "CODING", 
    "text": "JD Specific Problem description...", 
    "examples": [
       { "input": "...", "output": "..." },
       { "input": "...", "output": "..." }
    ],
    "marks": 25 
  }
]
Strictly valid JSON Array of length 2. No Markdown.
`;

const GRADE_CODING_PROMPT = (problem, code) => `
Act as a Strict Code Grader.
Problem: "${problem}"
Student Code: "${code}"

Marking Schema (Max 25):
- Base Case Correct: +5 Marks
- General Case Correct: +8 Marks
- Edge Case Correct: +12 Marks
Total = 5 + 8 + 12 = 25.

Task:
Analyze the code logic. Does it handle the base case? Does it handle the general logic? Does it handle edge cases (null, empty, large inputs)?
Return ONLY the integer score (0, 5, 8, 12, 13, 17, 20, or 25).
`;

const GENERATE_FEEDBACK_PROMPT = (jd, score, maxScore) => `
Generate a detailed technical feedback report for a candidate applying for the role: "${jd}".
Score Achieved: ${score} / ${maxScore}.

Task:
1. Write a 3-4 line professional SUMMARY of their performance based on the score.
   - If score > 70%: Praise their strong technical grasp and problem-solving skills.
   - If score < 50%: Highlight gaps in core concepts and coding implementation.
2. List 3 Key STRENGTHS based on the role.
3. List 3 Areas of WEAKNESS/IMPROVEMENT.
4. Provide a 3-step ROADMAP to improve.

Output Format: JSON Object
{
  "summary": "...",
  "strengths": ["...", "...", "..."],
  "weaknesses": ["...", "...", "..."],
  "roadmap": ["...", "...", "..."]
}
Strictly valid JSON. No Markdown.
`;

// --- ROUTES ---

app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (ADMIN_DIRECTORY[username] && ADMIN_DIRECTORY[username] === password) {
        const token = generateToken({ role: 'ADMIN', username });
        return res.json({ success: true, token });
    }
    res.status(401).json({ success: false });
});

app.get('/api/admin/sessions', verifyToken, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: "Admin Only" });
    const allSessions = [];
    SESSION_STORE.forEach((session, id) => {
        allSessions.push({
            sessionId: id,
            candidateName: session.candidate.name,
            email: session.candidate.email,
            score: session.finalScore || 0,
            maxScore: session.maxScore || 100,
            timestamp: session.startTime,
            status: session.status,
            evidenceCount: session.evidence ? session.evidence.length : 0,
            feedback: session.feedback // Critical: Include feedback for CSV export
        });
    });
    res.json({ sessions: allSessions.sort((a,b) => b.timestamp - a.timestamp) });
});

app.post('/api/admin/evidence', verifyToken, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: "Admin Only" });
    const session = SESSION_STORE.get(req.body.sessionId);
    if (!session) return res.status(404).json({ error: "Not Found" });
    res.json({ evidence: session.evidence || [], candidateName: session.candidate.name });
});

// NEW: ADMIN REACTIVATE ACCESS
app.post('/api/admin/reactivate', verifyToken, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: "Admin Only" });
    const { email } = req.body;
    
    if (CANDIDATE_ACCESS_STATE.has(email)) {
        CANDIDATE_ACCESS_STATE.delete(email);
        console.log(`[ADMIN] Reactivated access for ${email}`);
        return res.json({ success: true, message: "Candidate access reactivated." });
    }
    res.json({ success: false, message: "Candidate access was not locked." });
});

// NEW: MANAGE CANDIDATES (List)
app.get('/api/admin/candidates', verifyToken, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: "Admin Only" });
    const users = Object.entries(CANDIDATE_DIRECTORY).map(([email, code]) => ({
        email, 
        code, 
        isLocked: CANDIDATE_ACCESS_STATE.has(email)
    }));
    res.json({ candidates: users });
});

// NEW: MANAGE CANDIDATES (Create)
app.post('/api/admin/candidates', verifyToken, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: "Admin Only" });
    const { email, accessCode } = req.body;
    
    if (!email || !accessCode) return res.status(400).json({ error: "Missing fields" });
    if (CANDIDATE_DIRECTORY[email]) return res.status(400).json({ error: "Candidate email already exists" });

    CANDIDATE_DIRECTORY[email] = accessCode;
    console.log(`[ADMIN] Created new candidate: ${email}`);
    res.json({ success: true, message: "Candidate created successfully" });
});

// INITIAL GENERATION: S1 ONLY (30 MCQs)
app.post('/api/assessment/generate', async (req, res) => {
    try {
        const { jd, candidateName, candidateEmail, accessCode } = req.body;
        
        // AUTHENTICATION CHECK
        if (!CANDIDATE_DIRECTORY[candidateEmail]) {
            return res.status(403).json({ error: "Email not authorized for this assessment." });
        }
        if (CANDIDATE_DIRECTORY[candidateEmail] !== accessCode) {
            return res.status(403).json({ error: "Invalid Access Code." });
        }

        // ACCESS STATE CHECK
        if (CANDIDATE_ACCESS_STATE.get(candidateEmail)) {
            return res.status(403).json({ error: "Access Denied: Assessment already completed. Contact Admin." });
        }

        let s1Questions = [];
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: PROMPT_S1_MCQ(jd),
                config: { responseMimeType: 'application/json' }
            });
            const compactData = JSON.parse(cleanJSON(response.text));
            // Expand Compact Keys
            s1Questions = compactData.map((item, index) => ({
                id: index + 1,
                type: 'MCQ',
                text: item.q || item.text,
                options: item.o || item.options,
                correctAnswer: item.a !== undefined ? item.a : item.correctAnswer,
                marks: 1
            }));
        } catch (e) {
            console.error("Gen Failed", e);
            // Dynamic Fallback (Generic Professional)
            s1Questions = Array.from({length: 30}, (_, i) => ({
                id: i+1, type: 'MCQ', text: `Technical Assessment Question ${i+1} (Backup): Select the valid option for scalable architecture.`, options:['Microservices','Monolith','Serverless','Hybrid'], correctAnswer:0, marks:1
            }));
        }

        const fullSections = [
            { id: "s1-mcq", title: "Section 1: CS Fundamentals & Domain (30 Mins)", durationMinutes: 30, type: "MCQ", questions: s1Questions },
            { id: "s2-fitb", title: "Section 2: Technical Core (5 Mins)", durationMinutes: 5, type: "FITB", questions: [], isPending: true },
            { id: "s3-coding", title: "Section 3: Advanced Coding (40 Mins)", durationMinutes: 40, type: "CODING", questions: [], isPending: true }
        ];

        const sessionId = uuidv4();
        SESSION_STORE.set(sessionId, {
            fullSections,
            jd,
            candidate: { name: candidateName, email: candidateEmail },
            startTime: Date.now(),
            status: 'ACTIVE',
            evidence: [],
            finalScore: 0
        });

        const token = generateToken({ sessionId, role: 'CANDIDATE' });
        
        // Strip Answers
        const safeSections = fullSections.map(s => ({
            ...s, questions: s.questions.map(({correctAnswer, ...q}) => q)
        }));

        res.json({ token, sections: safeSections, sessionId });

    } catch (error) {
        res.status(500).json({ error: "Generation Failed: " + error.message });
    }
});

// DYNAMIC SECTION GENERATION (Just-In-Time)
app.post('/api/assessment/generate-section', verifyToken, async (req, res) => {
    const session = SESSION_STORE.get(req.user.sessionId);
    if (!session) return res.status(404).json({ error: "Session Not Found" });
    
    const { sectionId } = req.body;
    
    // Check if already generated
    const sectionIndex = session.fullSections.findIndex(s => s.id === sectionId);
    if (sectionIndex === -1) return res.status(400).json({ error: "Invalid Section" });
    
    // If questions exist, return them (idempotency)
    if (session.fullSections[sectionIndex].questions.length > 0) {
        return res.json({ questions: session.fullSections[sectionIndex].questions.map(({correctAnswer, ...q}) => q) });
    }

    let newQuestions = [];
    try {
        if (sectionId === 's2-fitb') {
            console.log(`Generating S2 for ${req.user.sessionId}`);
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: PROMPT_S2_FITB(session.jd),
                config: { responseMimeType: 'application/json' }
            });
            const rawQuestions = JSON.parse(cleanJSON(response.text));
            
            // DEDUPLICATION LOGIC
            const seen = new Set();
            newQuestions = rawQuestions.filter(q => {
                const duplicate = seen.has(q.text);
                seen.add(q.text);
                return !duplicate;
            });

            // Ensure FITB Type is strict
            newQuestions = newQuestions.map((q, i) => ({ ...q, id: 8000 + i, type: 'FITB' }));
        } 
        else if (sectionId === 's3-coding') {
            console.log(`Generating S3 for ${req.user.sessionId}`);
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: PROMPT_S3_CODING(session.jd),
                config: { responseMimeType: 'application/json' }
            });
            newQuestions = JSON.parse(cleanJSON(response.text));
            // FORCE 2 QUESTIONS if AI returns single object or weird wrapper
            if (!Array.isArray(newQuestions)) {
                 if(newQuestions.questions) newQuestions = newQuestions.questions;
                 else newQuestions = [newQuestions];
            }
            // FORMATTING: Append Examples to Text programmatically to ensure consistency
            newQuestions = newQuestions.map((q, i) => {
                let fullText = q.text;
                if (q.examples && Array.isArray(q.examples)) {
                    fullText += "\n\n**Sample Test Cases:**\n";
                    q.examples.forEach((ex, idx) => {
                        fullText += `\nExample ${idx + 1}:\nInput: ${ex.input}\nOutput: ${ex.output}\n`;
                    });
                }
                return { ...q, text: fullText, id: 9000 + i, type: 'CODING' };
            });
        }
    } catch (e) {
        console.error(`Dynamic Gen Error ${sectionId}`, e);
        // Robust Fallback
        if (sectionId === 's2-fitb') {
            newQuestions = [
                { id: 8001, type: "FITB", text: "The complexity of binary search is O(___).", correctAnswer: "log n", marks: 2 },
                { id: 8002, type: "FITB", text: "SQL command to remove a table is DROP ___.", correctAnswer: "TABLE", marks: 2 }
            ];
        } else {
            newQuestions = [
                { id: 9001, type: "CODING", text: "Problem 1: Implement a Balanced Binary Search Tree insertion logic.\n\nExample 1:\nInput: ...", marks: 25 },
                { id: 9002, type: "CODING", text: "Problem 2: Optimize an API response handler for large datasets.\n\nExample 1:\nInput: ...", marks: 25 }
            ];
        }
    }

    // Save to Store
    session.fullSections[sectionIndex].questions = newQuestions;
    session.fullSections[sectionIndex].isPending = false;

    res.json({ questions: newQuestions.map(({correctAnswer, ...q}) => q) });
});

app.post('/api/assessment/heartbeat', verifyToken, (req, res) => {
    const session = SESSION_STORE.get(req.user.sessionId);
    if (!session) return res.status(404).json({error: "Session lost"});
    
    // Log proctoring violation if present
    if (req.body.violation) {
        console.log(`[PROCTOR] Violation: ${req.body.violation} for ${req.user.sessionId}`);
        if (req.body.snapshot) {
             session.evidence.push({ type: req.body.violation, time: Date.now(), img: req.body.snapshot });
        }
    }
    
    res.json({ status: session.status });
});

app.post('/api/assessment/submit', verifyToken, async (req, res) => {
    const session = SESSION_STORE.get(req.user.sessionId);
    if (!session) return res.status(404).json({ error: "Invalid Session" });
    
    const { userAnswers } = req.body;
    let totalScore = 0; 
    let maxScore = 0;
    
    // LOCK ACCESS for this candidate
    CANDIDATE_ACCESS_STATE.set(session.candidate.email, true);
    console.log(`[ACCESS] Credentials locked for ${session.candidate.email}`);
    
    // Grade All Sections
    for (const section of session.fullSections) {
        for (const q of section.questions) {
            maxScore += (q.marks || 1);
            const userAns = userAnswers[q.id];
            
            if (q.type === 'MCQ') {
                if (Number(userAns) === Number(q.correctAnswer)) totalScore += (q.marks || 1);
            } 
            else if (q.type === 'FITB') {
                if (String(userAns||"").trim().toLowerCase() === String(q.correctAnswer).trim().toLowerCase()) totalScore += (q.marks || 2);
            } 
            else if (q.type === 'CODING') {
                // AI GRADING FOR CODING (Simulated to save time/tokens here, but using the rubric concept)
                // In production, you would await this.
                if (userAns && userAns.length > 20) {
                    try {
                         const gradeRes = await ai.models.generateContent({
                            model: 'gemini-2.5-flash',
                            contents: GRADE_CODING_PROMPT(q.text, userAns)
                        });
                        const awarded = parseInt(cleanJSON(gradeRes.text)) || 0;
                        totalScore += awarded;
                    } catch (e) {
                        // Fallback Grading if AI fails
                        totalScore += 5; // Assume base case passed if length > 20
                    }
                }
            }
        }
    }

    session.status = 'COMPLETED';
    session.finalScore = totalScore;
    session.maxScore = maxScore;
    session.endTime = Date.now();
    
    let feedback = {
        summary: "Assessment completed.",
        strengths: ["Participation"],
        weaknesses: [],
        roadmap: []
    };

    try {
        const feedbackRes = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: GENERATE_FEEDBACK_PROMPT(session.jd, totalScore, maxScore),
            config: { responseMimeType: 'application/json' }
        });
        feedback = JSON.parse(cleanJSON(feedbackRes.text));
    } catch (e) {
        console.error("Feedback Generation Failed", e);
        // Fallback Feedback if AI fails
        feedback = {
            summary: `The candidate scored ${totalScore}/${maxScore}. Performance analysis suggests reviewing core concepts for better technical readiness.`,
            strengths: ["Technical Attempt"],
            weaknesses: ["Accuracy", "Optimization"],
            roadmap: ["Review Core Algorithms", "Practice System Design"]
        };
    }
    
    session.feedback = feedback;
    
    console.log(`Session ${req.user.sessionId} Completed. Score: ${totalScore}`);

    res.json({ 
        success: true, 
        score: totalScore, 
        maxScore, 
        feedback: feedback, 
        gradedDetails: {} 
    });
});

app.post('/api/code/run', verifyToken, async (req, res) => {
    const { language, code, problem, customInput, examples } = req.body;
    
    // Construct Example Context
    let examplesContext = "";
    if (examples && Array.isArray(examples) && examples.length >= 2) {
        examplesContext = `
        Use these EXACT provided examples for the first two test cases:
        Example 1 (Base Case): Input: ${JSON.stringify(examples[0].input)}
        Example 2 (General Case): Input: ${JSON.stringify(examples[1].input)}
        `;
    }

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Act as a Strict Compiler or SQL Database Engine.
            Language: ${language}
            Problem: "${problem}"
            Student Code:
            ${code}
            ${customInput ? `\nUser provided Custom Input: "${customInput}"` : ''}
            
            ${examplesContext}

            Task: Validate the code logic or SQL query. Run 3 mental test cases.
            MARKING SCHEMA: Base Case (5 Marks), General Case (8 Marks), Edge Case (12 Marks).

            Output Format (Terminal Style Plain Text):
            > Compiling/Executing ${language}...
            > [Status] Syntax/Schema Check...
            ${customInput ? `> Running Custom Input [Input: ${customInput}] ... [Result/Output]\n` : ''}
            > Running Test Case 1 (Base Case) [Input: ${examples ? "As per Problem" : "Generated"}] [5 Marks]: [Result] ... [PASS/FAIL]
            > Running Test Case 2 (General Case) [Input: ${examples ? "As per Problem" : "Generated"}] [8 Marks]: [Result] ... [PASS/FAIL]
            > Running Test Case 3 (Edge Case) [Input: <Specific Edge Case>] [12 Marks]: [Result] ... [PASS/FAIL]
            
            > Final Verdict: [SUCCESS/FAILED]

            Rules:
            1. If Custom Input is provided, execute it FIRST and display the result clearly before standard tests.
            2. If "examples" were provided, you MUST use those specific inputs for Test Case 1 and 2 to ensure consistency with the problem description.
            3. If Syntax Error, output ONLY the error message and line number.
            4. If SQL, assume the schema provided in the problem statement exists and validate the query against it.
            5. Do NOT be lenient. If logic is wrong, FAIL the test case.
            6. Do NOT provide the corrected code or solution. Just the execution log.
            `,
        });
        
        res.json({ success: true, output: response.text });
    } catch (e) {
        console.error("Judge Error", e);
        // Fallback if AI fails
        res.json({ 
            success: false, 
            output: `> Compiling ${language}...\n> Error: Compiler Service Unavailable.\n> Please check your connection and try again.` 
        });
    }
});

const frontendPath = path.join(__dirname, '..', 'frontend', 'dist');

// Serve static assets
app.use(express.static(frontendPath));

// SPA fallback: any non-API GET should return index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on ${PORT}`));