
// --- CRYPTOGRAPHIC UTILITIES ---

// In a real app, this key would be negotiated via Diffie-Hellman on handshake.
// For this demo, we use a shared secret derived from the session token conceptually.
const CLIENT_SECRET = "evalueate-client-signing-secret-v1"; 

export const sanitizeInput = (input: string): string => {
  return input
    .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
    .replace(/<[^>]+>/g, "")
    .trim();
};

export const generateHash = async (message: string): Promise<string> => {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Generates an HMAC-SHA256 signature for the request payload.
 * Prevents tampering and Replay Attacks.
 */
export const signRequest = async (payload: any): Promise<{ signature: string; timestamp: string; nonce: string }> => {
    const timestamp = Date.now().toString();
    const nonce = Math.random().toString(36).substring(2) + Date.now().toString(36);
    
    // Create the data string to sign: Body + Timestamp + Nonce
    const dataString = JSON.stringify(payload) + timestamp + nonce;
    
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw", 
        enc.encode(CLIENT_SECRET), 
        { name: "HMAC", hash: "SHA-256" }, 
        false, 
        ["sign"]
    );
    
    const signature = await crypto.subtle.sign("HMAC", key, enc.encode(dataString));
    const signatureHex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
    
    return { signature: signatureHex, timestamp, nonce };
};

/**
 * Analyzes the browser environment for signs of Automation/VMs.
 */
export const analyzeEnvironment = (): { score: number; flags: string[] } => {
    let score = 0;
    const flags: string[] = [];
    
    // 1. WebDriver Check (Selenium/Puppeteer)
    if (navigator.webdriver) {
        score += 100;
        flags.push('WebDriver Detected');
    }

    // 2. Headless Browser Check (User Agent)
    if (/HeadlessChrome/.test(navigator.userAgent)) {
        score += 100;
        flags.push('Headless Chrome Detected');
    }

    // 3. Screen Dimensions (VMs often have weird resolutions)
    if (window.screen.width < 800 || window.screen.height < 600) {
        score += 20;
        flags.push('Suspicious Screen Resolution');
    }

    // 4. Plugin Length (Headless often has 0)
    if (navigator.plugins.length === 0) {
        score += 30;
        flags.push('No Plugins (Possible Headless)');
    }

    // 5. Evaluate Integrity
    if (window.outerWidth === 0 && window.outerHeight === 0) {
        score += 50;
        flags.push('Zero Window Size');
    }

    return { score, flags };
};

export const isSecureContext = (): boolean => {
  return window.isSecureContext;
};
