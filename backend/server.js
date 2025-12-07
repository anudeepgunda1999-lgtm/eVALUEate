
const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');
const { v4: uuidv4 } = require('uuid');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

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

// --- PERSISTENCE LAYER ---
const DB_FILE = path.resolve(__dirname, 'evalueate.db.json');

const loadDB = () => {
    try {
        if (fs.existsSync(DB_FILE)) {
            const raw = fs.readFileSync(DB_FILE, 'utf8');
            const data = JSON.parse(raw);
            
            // Restore Session Store
            if (data.sessions) {
                data.sessions.forEach(([k, v]) => SESSION_STORE.set(k, v));
            }
            // Restore Candidates
            if (data.candidates) {
                CANDIDATE_DIRECTORY = { ...CANDIDATE_DIRECTORY, ...data.candidates };
            }
            // Restore Access State
            if (data.accessState) {
                data.accessState.forEach(([k, v]) => CANDIDATE_ACCESS_STATE.set(k, v));
            }
            console.log(`[DB] Loaded ${SESSION_STORE.size} sessions and ${Object.keys(CANDIDATE_DIRECTORY).length} candidates from disk.`);
        }
    } catch (e) {
        console.error("[DB] Failed to load database:", e.message);
    }
};

const saveDB = () => {
    try {
        const data = {
            sessions: Array.from(SESSION_STORE.entries()),
            candidates: CANDIDATE_DIRECTORY,
            accessState: Array.from(CANDIDATE_ACCESS_STATE.entries())
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("[DB] Failed to save database:", e.message);
    }
};

// Initialize DB
loadDB();

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

const logAction = (sessionId, action, details = "") => {
    const session = SESSION_STORE.get(sessionId);
    if (session) {
        session.logs.push({
            timestamp: Date.now(),
            action,
            details
        });
        saveDB(); // Persist logs
    }
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
Generate exactly 10 DISTINCT Technical Fill-in-the-Blank questions.
DISTRIBUTION:
- 5 Questions MUST cover Core CS Fundamentals (DSA, DBMS, OS, Networks).
- 5 Questions MUST cover: "${jd.substring(0, 300)}".

Formatting Rules:
1. Return a JSON ARRAY of objects.
2. Ensure every question is unique. 
3. Do NOT make the entire question bold.
4. Do NOT use asterisks (*).

Format: JSON Array.
[
  {
    "id": 1, 
    "type": "FITB", 
    "text": "The time complexity of QuickSort is ___ in worst case.", 
    "correctAnswer": "O(n^2)", 
    "marks": 2,
    "caseSensitive": false
  },
  ...
]

Strictly valid JSON. No Markdown.
`;

const PROMPT_S3_CODING = (jd) => `
Generate EXACTLY 2 distinct LeetCode Hard/Medium Coding Problems.
DISTRIBUTION:
- Question 1: Pure Data Structures & Algorithms (DSA) - e.g., Graph, Tree, DP, Trie.
- Question 2: Job Description Specific Scenario related to: "${jd.substring(0, 300)}".

Formatting Rules:
1. Return a JSON ARRAY of exactly 2 objects.
2. Split the Problem Statement ("text" field) into 2-3 distinct paragraphs using newlines (\\n\\n).
3. If the problem requires SQL, you MUST provide the Table Schema in the "text" field.
4. **MANDATORY**: Provide 2 Sample Test Cases as a structured 'examples' array.
5. Do NOT use asterisks (*) or markdown.
6. The "text" field MUST contain the full problem description. Do not leave it empty.

Format: JSON ARRAY containing exactly 2 objects.
[
  { 
    "type": "CODING", 
    "text": "Detailed problem description here...\\n\\nMore details...", 
    "examples": [
       { "input": "...", "output": "..." },
       { "input": "...", "output": "..." }
    ],
    "marks": 25 
  },
  ...
]
Strictly valid JSON Array of length 2. No Markdown.
`;

const GRADE_CODING_PROMPT = (problem, code, examples) => `
Act as a RUTHLESS Senior Tech Interviewer and Compiler.
Problem: "${problem}"
Student Code: "${code}"
Provided Test Cases (Must Pass): ${JSON.stringify(examples)}

Strict Marking Schema (Total 25):
1. **Base Case (5 Marks)**: Does it handle simple/provided inputs correctly?
2. **General Logic (8 Marks)**: Is the algorithm correct for standard inputs?
3. **Edge Cases (12 Marks)**: Does it handle nulls, empty strings, max values, or boundary conditions?

Task:
Mentally execute the code against the provided examples and hidden edge cases.
- If the code is empty, irrelevant, or does not compile logic: 0.
- If it fails the provided Base Cases: 0 (Strict adherence).
- If it passes Base but fails General: 5.
- If it passes Base + General but fails Edge: 13.
- If it is perfect: 25.

Return ONLY the integer score (0, 5, 13, 17, 20, or 25). Do not return text.
`;

const GENERATE_FEEDBACK_PROMPT = (jd, score, maxScore, sectionScores, candidateName) => `
You are a Senior Technical Recruiter and Engineering Manager.
Analyze the assessment results for candidate "${candidateName || 'Candidate'}" applying for: "${jd}".

Data:
- Total Score: ${score} / ${maxScore}
- Section 1 (MCQ - CS Fundamentals): ${sectionScores.s1} marks
- Section 2 (FITB - Technical Depth): ${sectionScores.s2} marks
- Section 3 (Coding - Problem Solving): ${sectionScores.s3} marks

Task:
Generate a completely UNIQUE, dynamic, and non-generic feedback report.
1. **Summary**: Write a 3-4 line professional narrative about their specific performance. Mention their strongest section explicitly. Do NOT use generic templates.
2. **Strengths**: List 3 specific technical strengths based on the high-scoring sections.
3. **Weaknesses**: List 3 specific areas to improve based on the low-scoring sections.
4. **Roadmap**: Provide 3 concrete, actionable steps to improve for this specific role.

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
            sectionScores: session.sectionScores || { s1: 0, s2: 0, s3: 0 },
            timestamp: session.startTime,
            status: session.status,
            evidenceCount: session.evidence ? session.evidence.length : 0,
            feedback: session.feedback
        });
    });
    res.json({ sessions: allSessions.sort((a,b) => b.timestamp - a.timestamp) });
});

app.post('/api/admin/evidence', verifyToken, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: "Admin Only" });
    const session = SESSION_STORE.get(req.body.sessionId);
    if (!session) return res.status(404).json({ error: "Not Found" });
    res.json({ 
        evidence: session.evidence || [], 
        logs: session.logs || [],
        candidateName: session.candidate.name 
    });
});

// NEW: ADMIN REACTIVATE ACCESS
app.post('/api/admin/reactivate', verifyToken, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: "Admin Only" });
    const { email } = req.body;
    
    if (CANDIDATE_ACCESS_STATE.has(email)) {
        CANDIDATE_ACCESS_STATE.delete(email);
        saveDB(); // Persist change
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
    saveDB(); // Persist change
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
            logs: [{ timestamp: Date.now(), action: "SESSION_STARTED", details: "Assessment Initialized" }],
            finalScore: 0,
            sectionScores: { s1: 0, s2: 0, s3: 0 }
        });
        
        saveDB(); // Persist new session

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

    logAction(req.user.sessionId, "SECTION_GENERATED", `Generated ${sectionId}`);

    let newQuestions = [];
    let isFallbackUsed = false;

    try {
        if (sectionId === 's2-fitb') {
            console.log(`Generating S2 for ${req.user.sessionId}`);
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: PROMPT_S2_FITB(session.jd),
                config: { responseMimeType: 'application/json' }
            });
            const rawQuestions = JSON.parse(cleanJSON(response.text));
            
            // VALIDATION: Must be an array of at least 5 questions
            if (!Array.isArray(rawQuestions) || rawQuestions.length < 5) {
                throw new Error("AI returned insufficient FITB questions");
            }

            // DEDUPLICATION LOGIC
            const seen = new Set();
            newQuestions = rawQuestions.filter(q => {
                const duplicate = seen.has(q.text);
                seen.add(q.text);
                return !duplicate;
            });

            // Ensure FITB Type is strict
            newQuestions = newQuestions.map((q, i) => ({ ...q, id: 8000 + i, type: 'FITB', caseSensitive: !!q.caseSensitive }));
        } 
        else if (sectionId === 's3-coding') {
            console.log(`Generating S3 for ${req.user.sessionId}`);
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: PROMPT_S3_CODING(session.jd),
                config: { responseMimeType: 'application/json' }
            });
            newQuestions = JSON.parse(cleanJSON(response.text));
            
            // VALIDATION: Force 2 Questions
            if (!Array.isArray(newQuestions) || newQuestions.length < 1) {
                 if(newQuestions.questions) newQuestions = newQuestions.questions;
                 else if (newQuestions.text) newQuestions = [newQuestions];
                 else throw new Error("AI returned invalid Coding structure");
            }

            // VALIDATION: Check for empty text
            const hasValidText = newQuestions.every(q => q.text && q.text.length > 20);
            if (!hasValidText) throw new Error("AI generated empty coding problem text");
            
            // If only 1 generated, assume error and throw to trigger fallback (since strict requirement is 2)
            if (newQuestions.length < 2) throw new Error("AI generated insufficient coding questions");

            // FORMATTING: Append Examples to Text programmatically to ensure consistency
            newQuestions = newQuestions.map((q, i) => {
                let fullText = q.text || "Problem Statement Loading...";
                
                // Ensure examples is an array
                if (!q.examples || !Array.isArray(q.examples)) {
                    q.examples = [
                        { input: "(See Problem Description)", output: "(See Problem Description)" }
                    ];
                }

                fullText += "\n\n**Sample Test Cases:**\n";
                q.examples.forEach((ex, idx) => {
                    const inp = typeof ex.input === 'object' ? JSON.stringify(ex.input) : ex.input;
                    const out = typeof ex.output === 'object' ? JSON.stringify(ex.output) : ex.output;
                    fullText += `\nExample ${idx + 1}:\nInput: ${inp}\nOutput: ${out}\n`;
                });
                return { ...q, text: fullText, id: 9000 + i, type: 'CODING' };
            });
        }
    } catch (e) {
        console.error(`Dynamic Gen Error ${sectionId}`, e);
        isFallbackUsed = true;
    }

    // ROBUST FALLBACK INJECTION (If AI failed)
    if (isFallbackUsed || newQuestions.length === 0) {
        console.log(`Using Backup Questions for ${sectionId}`);
        if (sectionId === 's2-fitb') {
            newQuestions = [
                { id: 8001, type: "FITB", text: "The complexity of binary search is O(___).", correctAnswer: "log n", marks: 2 },
                { id: 8002, type: "FITB", text: "SQL command to remove a table is DROP ___.", correctAnswer: "TABLE", marks: 2 },
                { id: 8003, type: "FITB", text: "HTTP status code 404 means Not ___.", correctAnswer: "Found", marks: 2 },
                { id: 8004, type: "FITB", text: "In OOP, inheritance represents a '___-a' relationship.", correctAnswer: "is", marks: 2 },
                { id: 8005, type: "FITB", text: "To protect shared resources in threads, we use a ___.", correctAnswer: "Lock", marks: 2 },
                { id: 8006, type: "FITB", text: "The data structure using LIFO principle is a ___.", correctAnswer: "Stack", marks: 2 },
                { id: 8007, type: "FITB", text: "DNS translates domain names to ___ addresses.", correctAnswer: "IP", marks: 2 },
                { id: 8008, type: "FITB", text: "In REST API, POST is used to ___ a resource.", correctAnswer: "Create", marks: 2 },
                { id: 8009, type: "FITB", text: "Git command to combine branches is git ___.", correctAnswer: "merge", marks: 2 },
                { id: 8010, type: "FITB", text: "Docker uses ___ to package applications.", correctAnswer: "containers", marks: 2 }
            ];
        } else {
            newQuestions = [
                { 
                    id: 9001, 
                    type: "CODING", 
                    text: "Problem 1: Implement a function to check if a Linked List has a cycle.\n\n**Sample Test Cases:**\nExample 1:\nInput: Head -> [3,2,0,-4], Pos = 1\nOutput: True\n", 
                    examples: [{input:"[3,2,0,-4], pos=1", output:"true"}],
                    marks: 25 
                },
                { 
                    id: 9002, 
                    type: "CODING", 
                    text: "Problem 2: Given an array of integers, return indices of the two numbers such that they add up to a specific target.\n\n**Sample Test Cases:**\nExample 1:\nInput: nums = [2,7,11,15], target = 9\nOutput: [0,1]\n", 
                    examples: [{input:"nums = [2,7,11,15], target = 9", output:"[0,1]"}],
                    marks: 25 
                }
            ];
        }
    }

    // Save to Store
    session.fullSections[sectionIndex].questions = newQuestions;
    session.fullSections[sectionIndex].isPending = false;
    saveDB(); // Persist generated section

    res.json({ questions: newQuestions.map(({correctAnswer, ...q}) => q) });
});

app.post('/api/assessment/heartbeat', verifyToken, (req, res) => {
    const session = SESSION_STORE.get(req.user.sessionId);
    if (!session) return res.status(404).json({error: "Session lost"});
    
    // Log proctoring violation if present
    if (req.body.violation) {
        logAction(req.user.sessionId, "VIOLATION_DETECTED", req.body.violation);
        if (req.body.snapshot) {
             session.evidence.push({ type: req.body.violation, time: Date.now(), img: req.body.snapshot });
             saveDB(); // Persist evidence
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
    
    // Strict Section-Wise Breakdown
    let sectionScores = { s1: 0, s2: 0, s3: 0 };
    
    try {
        // LOCK ACCESS for this candidate
        CANDIDATE_ACCESS_STATE.set(session.candidate.email, true);
        logAction(req.user.sessionId, "SUBMITTED", "Assessment Completed");
        console.log(`[ACCESS] Credentials locked for ${session.candidate.email}`);
        
        // Grade All Sections
        for (const section of session.fullSections) {
            for (const q of section.questions) {
                maxScore += (q.marks || 1);
                const userAns = userAnswers[q.id];
                
                // SECTION 1: MCQ (Exact Match)
                if (q.type === 'MCQ') {
                    if (Number(userAns) === Number(q.correctAnswer)) {
                        totalScore += (q.marks || 1);
                        sectionScores.s1 += (q.marks || 1);
                    }
                } 
                // SECTION 2: FITB (String Match, Optional Case Sensitivity)
                else if (q.type === 'FITB') {
                    const u = String(userAns||"").trim();
                    const c = String(q.correctAnswer).trim();
                    
                    const match = q.caseSensitive 
                        ? u === c
                        : u.toLowerCase() === c.toLowerCase();

                    if (match) {
                        totalScore += (q.marks || 2);
                        sectionScores.s2 += (q.marks || 2);
                    }
                } 
                // SECTION 3: CODING (Ruthless AI Grading)
                else if (q.type === 'CODING') {
                    if (userAns && userAns.length > 20) {
                        try {
                             const gradeRes = await ai.models.generateContent({
                                model: 'gemini-2.5-flash',
                                contents: GRADE_CODING_PROMPT(q.text, userAns, q.examples || [])
                            });
                            
                            // Regex Parse to extract score even if AI chats (e.g., "Score: 20")
                            const match = gradeRes.text.match(/\b(0|5|13|17|20|25)\b/);
                            const awarded = match ? parseInt(match[0]) : 0;
                            
                            totalScore += awarded;
                            sectionScores.s3 += awarded;
                            logAction(req.user.sessionId, "GRADING_CODING", `Q${q.id} Awarded: ${awarded}/25`);
                        } catch (e) {
                            // Fallback Grading if AI fails (Safety Net)
                            logAction(req.user.sessionId, "GRADING_ERROR", `Failed to grade Q${q.id}`);
                        }
                    }
                }
            }
        }

        // GENERATE DYNAMIC FEEDBACK
        let feedback = {
            summary: "Assessment processed successfully.",
            strengths: ["Completed Assessment"],
            weaknesses: [],
            roadmap: []
        };

        try {
            const feedbackRes = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: GENERATE_FEEDBACK_PROMPT(session.jd, totalScore, maxScore, sectionScores, session.candidate.name),
                config: { responseMimeType: 'application/json' }
            });
            feedback = JSON.parse(cleanJSON(feedbackRes.text));
        } catch (e) {
            console.error("Feedback Gen Failed", e);
        }
        session.feedback = feedback;

    } catch(err) {
        console.error("Submission Process Error:", err);
    } finally {
        // ALWAYS SAVE STATE, even if grading hiccups
        session.status = 'COMPLETED';
        session.finalScore = totalScore;
        session.maxScore = maxScore;
        session.sectionScores = sectionScores;
        session.endTime = Date.now();
        
        saveDB(); // Persist completion state

        console.log(`Session ${req.user.sessionId} FINALIZED.`);
        console.log(`SCORES: Total=${totalScore}, S1=${sectionScores.s1}, S2=${sectionScores.s2}, S3=${sectionScores.s3}`);
        
        res.json({ 
            success: true, 
            score: totalScore, 
            maxScore, 
            feedback: session.feedback, 
            sectionScores,
            gradedDetails: {} 
        });
    }
});

app.post('/api/code/run', verifyToken, async (req, res) => {
    const { language, code, problem, customInput, examples } = req.body;
    
    // Construct Example Context with EXPECTED OUTPUT
    let examplesContext = "";
    if (examples && Array.isArray(examples) && examples.length >= 2) {
        examplesContext = `
        Use these EXACT provided examples for the first two test cases:
        Example 1 (Base Case): Input: ${JSON.stringify(examples[0].input)} | Expected Output: ${JSON.stringify(examples[0].output)}
        Example 2 (General Case): Input: ${JSON.stringify(examples[1].input)} | Expected Output: ${JSON.stringify(examples[1].output)}
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
            2. If "examples" were provided, you MUST use those specific inputs for Test Case 1 and 2 AND compare the student's output against the Expected Output provided.
            3. If output does NOT match expected output exactly, the test case is FAIL.
            4. If Syntax Error, output ONLY the error message and line number.
            5. If SQL, assume the schema provided in the problem statement exists and validate the query against it.
            6. Do NOT be lenient. If logic is wrong, FAIL the test case.
            7. Do NOT provide the corrected code or solution. Just the execution log.
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
