# AutoChatix Backend - Comprehensive Code Review

**Date:** May 2026  
**Reviewer:** Code Review Agent  
**Scope:** Express 5, TypeScript, MongoDB (Mongoose), JWT, WebSocket, AWS, Payment integrations  

---

## Executive Summary

The AutoChatix backend demonstrates a modern Node.js architecture with multi-tenant support, WebSocket integration, and third-party payment/delivery integrations. However, several critical and high-severity security, authentication, and operational issues require immediate attention before production deployment. Key concerns include hardcoded secrets in configuration files, weak JWT secrets, missing rate limiting, WebSocket authentication gaps, and insufficient input validation on file uploads and API endpoints.

---

## Critical Issues (Must Fix Immediately)

### 1. **Hardcoded Secrets in Repository**
**Severity:** CRITICAL  
**Files:** `.env` (lines 1-12), `serverless.yml` (lines 40-54)

**Issue:**  
Secrets are checked into version control:
- `.env` contains plaintext database credentials, API keys, and tokens (JWT_SECRET, WHATSAPP_VERIFY_TOKEN, GOOGLE_PRIVATE_KEY, MongoDB URI)
- `serverless.yml` duplicates all secrets in the deployment configuration
- These files are tracked by git and visible to anyone with repo access

**Why it matters:**  
- Credentials can be extracted from git history even if deleted
- Any developer can access production database and third-party service credentials
- Violates security best practices and compliance requirements

**Fix:**
```bash
# 1. Remove .env and serverless.yml from git history
git filter-branch --tree-filter 'rm -f .env serverless.yml' HEAD

# 2. Add to .gitignore
echo ".env" >> .gitignore
echo "serverless.yml" >> .gitignore

# 3. Use AWS Secrets Manager or environment variables only
# Reference: src/index.ts, src/auth.middleware.ts, etc.
# Use: process.env.JWT_SECRET (injected at deploy time, never committed)

# 4. Rotate all exposed credentials immediately:
# - MongoDB password
# - JWT_SECRET → use random 32+ char string
# - WHATSAPP_VERIFY_TOKEN
# - GOOGLE_PRIVATE_KEY
# - API keys (Meta, Razorpay, Stripe, etc.)
```

---

### 2. **Weak JWT Secret**
**Severity:** CRITICAL  
**Files:** `.env` line 9, `serverless.yml` line 49

**Issue:**  
JWT_SECRET is hardcoded as `"lalit"` (4 characters). This allows attackers to forge tokens for any user/account.

```typescript
// src/middlewares/auth.middleware.ts:37
const decoded = jwt.verify(token, process.env.JWT_SECRET as string)
// JWT_SECRET = "lalit" → trivially brute-forceable
```

**Why it matters:**  
- Any attacker can generate valid tokens for any account_id/user_id
- Complete account takeover without password
- Bypasses all authorization checks

**Fix:**
```bash
# Generate a strong secret (minimum 32 characters, preferably random)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Output: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6

# Store in AWS Secrets Manager or environment-only
# Update code to require minimum secret length at startup:
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters");
}

# Use in auth.middleware.ts:
const decoded = jwt.verify(token, process.env.JWT_SECRET);
```

---

### 3. **WebSocket Connected Without Token Authentication**
**Severity:** CRITICAL  
**File:** `src/index.ts` (lines 134-150)

**Issue:**  
WebSocket connection validates only `accountId` query parameter, no JWT token required. Any attacker can spoof any account ID and receive messages intended for that account.

```typescript
// src/index.ts:134-141
wss.on("connection", (ws: any, req: any) => {
  const url = new URL(req.url, `http://localhost`);
  const accountId = url.searchParams.get("accountId");  // ← NO TOKEN VERIFICATION
  if (!accountId) {
    ws.close(1008, "accountId required");
    return;
  }
  addLocalConnection(accountId, ws);
});
```

**Why it matters:**  
- Cross-account data leakage: user with account A can listen to account B's messages
- No authentication tied to user identity
- Real-time message notifications, conversation updates all exposed

**Fix:**
```typescript
// src/index.ts: Extract and verify JWT before accepting connection
const url = new URL(req.url, `http://localhost`);
const token = url.searchParams.get("token");
const accountId = url.searchParams.get("accountId");

if (!token || !accountId) {
  ws.close(1008, "token and accountId required");
  return;
}

try {
  const decoded = jwt.verify(token, process.env.JWT_SECRET) as JwtPayload;
  
  // Ensure token matches accountId
  if (decoded.account_id !== accountId) {
    ws.close(1008, "account mismatch");
    return;
  }
  
  // Store user_id for access control in message routing
  ws.userId = decoded.user_id;
  ws.accountId = accountId;
  
  addLocalConnection(accountId, ws);
} catch (err) {
  ws.close(1008, "Invalid token");
}
```

---

### 4. **Webhook Endpoints Lack Signature Verification**
**Severity:** CRITICAL  
**File:** `src/routes/webhook.route.ts` (lines 29-30), `src/controllers/webhook.controller.ts` (lines 85-87)

**Issue:**  
The main webhook endpoint `POST /webhook` accepts Meta WhatsApp messages without verifying the webhook signature. An attacker can inject fake messages, contacts, and trigger automations.

```typescript
// src/routes/webhook.route.ts:30
router.post("/", receiveMessage);  // ← NO SIGNATURE VERIFICATION

// src/controllers/webhook.controller.ts:85-87
export const receiveMessage = async (req: Request, res: Response) => {
  console.log("req.body ::", JSON.stringify(req.body));
  const value = req.body?.entry?.[0]?.changes?.[0]?.value;
  // ← Accepts ANY request, no signature check
```

The only webhook that verifies signatures is Razorpay (src/integrations/webhooks/razorpay.webhook.ts:20-36), but it's in a separate integration handler, not the main Meta webhook.

**Why it matters:**  
- Fake message injection: attacker can impersonate contacts and trigger automations
- Spam/harassment via WhatsApp automation (e.g., send bulk messages on fake order)
- Database pollution with fake contacts and messages
- Automations triggered by malicious payloads could perform unauthorized actions

**Fix:**
```typescript
// src/controllers/webhook.controller.ts
import crypto from "crypto";

const verifyMetaWebhookSignature = (
  req: Request,
  secret: string
): boolean => {
  const signature = req.headers["x-hub-signature-256"] as string;
  if (!signature) return false;
  
  const raw = (req as any).rawBody || JSON.stringify(req.body);
  const hash = crypto
    .createHmac("sha256", secret)
    .update(raw)
    .digest("hex");
  
  return signature === `sha256=${hash}`;
};

export const receiveMessage = async (req: Request, res: Response) => {
  const signature = req.headers["x-hub-signature-256"] as string;
  
  if (!verifyMetaWebhookSignature(req, process.env.WHATSAPP_APP_SECRET!)) {
    return res.status(403).json({ error: "Invalid signature" });
  }
  
  // ... rest of message handling
};
```

Store `WHATSAPP_APP_SECRET` securely (AWS Secrets Manager, not .env).

---

### 5. **Media Upload Missing Validation**
**Severity:** HIGH  
**Files:** `src/middlewares/upload.middleware.ts`, `src/routes/media.routes.ts` (line 13), `src/controllers/media.controller.ts`

**Issue:**  
File upload accepts any MIME type and has only a fileSize limit (10 MB). No checks for:
- File type whitelist (only accept images, video, audio, PDF)
- Executable files (.exe, .sh, .bat)
- Archive bombs or zip files with path traversal

```typescript
// src/middlewares/upload.middleware.ts:4-10
export const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },  // ← Only fileSize, no type check
});

// Uses file.originalname directly → path traversal risk (e.g., "../../etc/passwd")
```

**Why it matters:**  
- Malicious file uploads (executables, scripts) stored temporarily on disk
- Path traversal: filename like `../../etc/passwd` could escape tmpdir
- No virus scanning or content validation

**Fix:**
```typescript
// src/middlewares/upload.middleware.ts
const ALLOWED_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "audio/mpeg",
  "audio/wav",
  "application/pdf"
];

export const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => {
      // Sanitize filename: use UUID only, preserve extension
      const ext = file.originalname.split(".").pop() || "bin";
      cb(null, `${uuidv4()}.${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
    } else {
      cb(null, true);
    }
  },
});
```

---

## High-Severity Issues

### 6. **Bcrypt Round Count Too Low**
**Severity:** HIGH  
**File:** `src/controllers/auth.conroller.ts` line 40

**Issue:**  
Password hashing uses only 10 rounds of bcrypt. Recommended is 12+ for production.

```typescript
// src/controllers/auth.conroller.ts:40
const hashedPassword = await bcrypt.hash(password, 10);  // ← Only 10 rounds
```

**Why it matters:**  
- Faster password cracking with modern GPU farms
- Each additional round doubles the computational cost to crack

**Fix:**
```typescript
const hashedPassword = await bcrypt.hash(password, 12);  // 10-15 rounds recommended
```

---

### 7. **No CORS Origin Whitelist (Wide Open)**
**Severity:** HIGH  
**File:** `src/index.ts` line 44

**Issue:**  
CORS is enabled with no options, allowing any origin to make requests.

```typescript
// src/index.ts:44
app.use(cors());  // ← Allows all origins
```

This is overridden in `serverless.yml` for AWS, but the local Express server is vulnerable.

**Why it matters:**  
- CSRF attacks from malicious websites
- Unauthorized clients can call your API
- XSS on third-party domains can exfiltrate user data

**Fix:**
```typescript
// src/index.ts
import cors from "cors";

const ALLOWED_ORIGINS = [
  "https://app.autochatix.com",
  "https://www.autochatix.com",
  process.env.NODE_ENV === "development" ? "http://localhost:3000" : undefined,
].filter(Boolean);

app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
```

---

### 8. **No Rate Limiting**
**Severity:** HIGH  
**File:** `src/index.ts` (entire middleware stack)

**Issue:**  
No rate limiting on any endpoint. Attackers can:
- Brute-force login (test 10,000 passwords/min)
- Flood webhook endpoint with fake messages
- DOS the API by making thousands of requests/second

**Why it matters:**  
- Account takeover via credential stuffing
- Database DOS from malicious automation triggers
- Billing abuse (Razorpay webhooks could be replayed)

**Fix:**
```typescript
// src/index.ts
import rateLimit from "express-rate-limit";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,                     // 5 login attempts
  message: "Too many login attempts, try again later",
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,            // 100 requests per minute
});

app.use("/api/", apiLimiter);
app.use("/api/auth/login", loginLimiter);
```

Install: `npm install express-rate-limit`

---

### 9. **Missing Helmet Security Headers**
**Severity:** HIGH  
**File:** `src/index.ts` (entire middleware stack)

**Issue:**  
No security headers (X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security, CSP). Vulnerable to:
- Clickjacking attacks
- MIME-sniffing exploits
- XSS if frontend loads untrusted content

**Fix:**
```typescript
// src/index.ts
import helmet from "helmet";

app.use(helmet());

app.use(helmet.hsts({
  maxAge: 31536000,      // 1 year
  includeSubDomains: true,
  preload: true,
}));

app.use(helmet.frameguard({ action: "deny" }));
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "https:"],
  },
}));
```

Install: `npm install helmet`

---

### 10. **Contact Queries Missing accountId Filter**
**Severity:** HIGH  
**Files:** `src/controllers/contact.controller.ts` line 390, similar patterns

**Issue:**  
In `exportContacts`, contacts are fetched by `channel_id` only, no check that the channel belongs to the authenticated user's account.

```typescript
// src/controllers/contact.controller.ts:390
const contacts = await Contact.find({ channel_id: channelId });
// ← No verification that channelId belongs to req.user?.account_id
```

If an attacker guesses a valid channel_id from another account, they can export all contacts.

**Why it matters:**  
- Cross-account data leakage
- Export protected customer data (names, phone numbers, attributes)
- Potential GDPR/privacy violation

**Fix:**
```typescript
// src/controllers/contact.controller.ts - in exportContacts
const accountId = req.user?.account_id;

// Verify channel belongs to this account
const channel = await Channel.findOne({
  _id: channelId,
  account_id: accountId,
});

if (!channel) {
  return res.status(403).json({ message: "Channel not found" });
}

const contacts = await Contact.find({ channel_id: channelId });
```

Apply this pattern to all contact/channel/message queries.

---

### 11. **No Input Validation on Request Bodies**
**Severity:** HIGH  
**File:** All route handlers (e.g., `src/controllers/auth.conroller.ts` lines 20-26, 84-85)

**Issue:**  
Request bodies are accessed directly without validation library (joi, zod, yup).

```typescript
// src/controllers/auth.conroller.ts:20-26
export const register = async (req: Request, res: Response) => {
  const { email, phone, password, user_name, account_name } = req.body;
  
  if (!email || !phone || !password || !user_name || !account_name) {
    return res.status(400).json({ message: "All fields are required" });
  }
  // ← Only checks for presence, not format, length, or type
```

Missing validation:
- Email format (RFC 5322)
- Phone number format/length
- Password strength (minimum 8 chars, complexity)
- SQL injection in text fields
- String length limits (DoS via extremely long strings)

**Fix:**
```typescript
// Install: npm install zod
import { z } from "zod";

const RegisterSchema = z.object({
  email: z.string().email(),
  phone: z.string().regex(/^\+?[\d\s-]{10,15}$/),
  password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
  user_name: z.string().min(1).max(100),
  account_name: z.string().min(1).max(100),
});

export const register = async (req: Request, res: Response) => {
  try {
    const data = RegisterSchema.parse(req.body);
    // ← data is now type-safe and validated
  } catch (err: any) {
    return res.status(400).json({ errors: err.errors });
  }
};
```

---

## Medium-Severity Issues

### 12. **NoSQL Injection via $-Operators**
**Severity:** MEDIUM  
**File:** Potential across all find() queries if query object is user-supplied

**Issue:**  
If attacker sends JSON with `$operators` (e.g., `{"email": {"$ne": null}}`), MongoDB will parse them as operators, not strings.

```typescript
// Example vulnerable pattern:
const query = { email: req.body.email };  // If body is {"email": {"$ne": null}}
User.find(query);  // Returns all users where email != null
```

Currently mitigated by using specific fields, but worth documenting.

**Fix:**
Use Mongoose schema type coercion (already in place for most models), but add explicit sanitization:
```typescript
import mongoSanitize from "express-mongo-sanitize";

app.use(mongoSanitize());  // Removes $ and . from keys
```

---

### 13. **Missing Database Indexes for Query Performance**
**Severity:** MEDIUM  
**Files:** `src/models/contact.model.ts`, `src/models/message.model.ts`

**Issue:**  
Message model likely missing compound indexes for fast retrieval.

Expected indexes:
- `{ contact_id: 1, createdAt: -1 }` for paginated message history
- `{ channel_id: 1, createdAt: -1 }` for bulk exports
- `{ account_id: 1, is_active: 1 }` already present in Channel

Without these, queries scan entire collections (O(n) instead of O(log n)).

**Fix:**  
Review all models and add necessary indexes:
```typescript
// src/models/message.model.ts
MessageSchema.index({ contact_id: 1, createdAt: -1 });
MessageSchema.index({ channel_id: 1, createdAt: -1 });
MessageSchema.index({ account_id: 1, createdAt: -1 });
```

---

### 14. **Excessive Console.log Leaking Sensitive Data**
**Severity:** MEDIUM  
**Files:** 141 occurrences across 36 files

**Issue:**  
Extensive use of `console.log()` throughout the codebase, especially:
- `src/controllers/webhook.controller.ts:87` — logs entire webhook body (could contain PII)
- `src/services/s3v2.service.ts:22-25` — logs S3 response and bucket URLs
- Many integration and automation handlers log raw data

```typescript
// src/controllers/webhook.controller.ts:87
console.log("req.body ::", JSON.stringify(req.body));
// Logs: phone numbers, names, message content, contact details

// src/services/s3v2.service.ts:24-25
console.log("{process.env.WHATSAPP_BUCKET",process.env.WHATSAPP_BUCKET)
// Leaks AWS bucket name and region to logs
```

**Why it matters:**  
- PII in logs violates GDPR/privacy regulations
- AWS logs stored for 30 days — exposed to developers
- Production logs should use structured logging, not console.log

**Fix:**
```typescript
// Install: npm install winston
import winston from "winston";

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
  ],
});

// Usage (no PII):
logger.info("Webhook received", { waId, channelId, messageType });

// Never:
logger.info("Webhook body:", req.body);  // ← Don't log full payload
```

Remove all `console.log()` from production code.

---

### 15. **S3 URLs Not Using Signed URLs**
**Severity:** MEDIUM  
**Files:** `src/services/s3v2.service.ts` (line 27)

**Issue:**  
Media files are stored with public URLs: `https://bucket.s3.region.amazonaws.com/key`  
If bucket is accidentally public-readable, all media files are publicly accessible.

```typescript
// src/services/s3v2.service.ts:27
return `https://${process.env.WHATSAPP_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
// ← Public URL if bucket allows public reads
```

**Why it matters:**  
- Customer data (profile pictures, media) visible to anyone
- Bandwidth costs for attackers scraping files
- Privacy violation if bucket misconfigured

**Fix:**
```typescript
// Use S3 presigned URLs with expiry
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const getPresignedUrl = async (key: string, expiresIn = 3600) => {
  const command = new GetObjectCommand({
    Bucket: process.env.WHATSAPP_BUCKET,
    Key: key,
  });
  
  return getSignedUrl(s3, command, { expiresIn });
};

// Usage:
const presignedUrl = await getPresignedUrl(key);  // Expires in 1 hour
```

---

### 16. **Missing Error Boundaries & Stack Trace Leakage**
**Severity:** MEDIUM  
**Files:** All controllers

**Issue:**  
Generic error responses don't hide stack traces, but also no global error handler to prevent accidental exposure.

```typescript
// src/controllers/auth.conroller.ts:71-76
} catch (error) {
  console.error("Register error:", error);  // ← Stack trace in logs
  return res.status(500).json({
    message: "Something went wrong",
  });
}
```

In production, if error is returned in response, attackers gain code structure info.

**Fix:**
```typescript
// src/middlewares/errorHandler.ts
import { Request, Response, NextFunction } from "express";

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const status = err.status || 500;
  
  // Log full error for debugging
  if (status === 500) {
    console.error("[ERROR]", err);
  }
  
  // Return safe message to client
  res.status(status).json({
    error: status === 500 ? "Internal server error" : err.message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

// app.use(errorHandler) at the end of src/index.ts
```

---

## Low-Severity Issues & Recommendations

### 17. **TypeScript Any Abuse**
**Severity:** LOW  
**Files:** `src/index.ts` line 134, `src/wsHandler.ts` line 13, many others

```typescript
// src/index.ts:134
wss.on("connection", (ws: any, req: any) => {
  // ← Should be typed as WebSocket.WebSocket and http.IncomingMessage
```

**Fix:**  
Use proper TypeScript types from `@types/ws`:
```typescript
import { WebSocket } from "ws";
import { IncomingMessage } from "http";

wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  // Proper typing enables IDE autocomplete and catches bugs
});
```

---

### 18. **Missing Refresh Token Implementation**
**Severity:** LOW  
**File:** `src/controllers/auth.conroller.ts` (lines 100-108, 135-143)

**Issue:**  
JWT tokens expire in 7 days with no refresh mechanism. After expiry, user must re-login.

**Recommendation:**  
Implement refresh tokens stored in HttpOnly cookies:
```typescript
// Issue short-lived access token (15 min) + long-lived refresh token (7 days)
const accessToken = jwt.sign({ user_id, account_id }, JWT_SECRET, { expiresIn: "15m" });
const refreshToken = jwt.sign({ user_id }, REFRESH_SECRET, { expiresIn: "7d" });

// Store refreshToken in DB or Redis for revocation
await RefreshToken.create({ token: refreshToken, user_id });

// Return access token in response, refresh token in HttpOnly cookie
res.cookie("refreshToken", refreshToken, {
  httpOnly: true,
  secure: true,
  sameSite: "strict",
  maxAge: 7 * 24 * 60 * 60 * 1000,
});
```

---

### 19. **Missing Request Logging & Audit Trail**
**Severity:** LOW  
**File:** Middleware stack

**Issue:**  
No request logging for security audits. Can't trace who did what.

**Recommendation:**
```typescript
// src/middlewares/audit.middleware.ts
import { Request, Response, NextFunction } from "express";

export const auditMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info("Request completed", {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      userId: req.user?.user_id,
      accountId: req.user?.account_id,
      duration,
      ip: req.ip,
    });
  });
  
  next();
};
```

---

### 20. **Mongoose Lean Queries Not Always Used**
**Severity:** LOW  
**Files:** `src/controllers/message.controller.ts`, `src/controllers/contact.controller.ts`

**Issue:**  
Some queries use `.lean()` for performance, others don't. Inconsistent.

**Recommendation:**  
Always use `.lean()` for read-only queries to avoid Mongoose overhead:
```typescript
// Fast (returns plain JSON)
Message.find(query).lean();

// Slower (returns Mongoose documents)
Message.find(query);  // ← Unless you need to modify/save
```

---

### 21. **OAuth2 Integrations Not Using PKCE**
**Severity:** LOW  
**File:** `src/routes/webhook.route.ts` lines 11-27 (Instagram callback)

**Issue:**  
Instagram OAuth flow stores authorization code in browser, vulnerable to code interception.

**Recommendation:**  
Implement PKCE (Proof Key for Code Exchange):
```typescript
// Generate code_challenge on frontend
const codeVerifier = generateRandomString(128);
const codeChallenge = base64url(sha256(codeVerifier));

// Pass to Instagram auth URL
const authUrl = `https://api.instagram.com/oauth/authorize?code_challenge=${codeChallenge}&code_challenge_method=S256&...`;

// Exchange with code_verifier
const token = await exchangeCode(code, codeVerifier);
```

---

## Dependency Review Notes

### Package Versions
- **Express ^5.2.1**: Brand new (5.0 released Q2 2024). Ensure it's stable for production.
- **@types/node ^25.0.1**: Unusual (most projects use ~20). Verify compatibility.
- **mongoose ^9.0.2**: Verify this is correct; latest stable is 8.x. If 9.x, it's cutting-edge.
- **stripe ^20.1.0**: Current. OK.

### Missing Packages
- **helmet**: No security headers (add immediately)
- **express-rate-limit**: No rate limiting (add immediately)
- **zod/joi**: No input validation library (add immediately)
- **winston**: No structured logging (recommended)
- **express-mongo-sanitize**: No NoSQL injection prevention (add)

---

## Summary Table

| Issue | Severity | File | Line | Status |
|-------|----------|------|------|--------|
| Hardcoded secrets in repo | CRITICAL | .env, serverless.yml | All | Must fix before prod |
| Weak JWT secret | CRITICAL | .env, serverless.yml | 9, 49 | Must fix |
| WS no token auth | CRITICAL | src/index.ts | 134 | Must fix |
| Webhook no signature | CRITICAL | webhook.controller.ts | 85 | Must fix |
| Media upload no validation | HIGH | upload.middleware.ts | 4-10 | Must fix |
| Bcrypt rounds too low | HIGH | auth.conroller.ts | 40 | Should fix |
| CORS wide open | HIGH | src/index.ts | 44 | Should fix |
| No rate limiting | HIGH | src/index.ts | Global | Should add |
| No Helmet | HIGH | src/index.ts | Global | Should add |
| Contact queries missing accountId | HIGH | contact.controller.ts | 390 | Should fix |
| No input validation | HIGH | All controllers | Various | Should add |
| NoSQL injection risk | MEDIUM | All queries | Various | Mitigate with sanitize |
| Missing indexes | MEDIUM | Models | Various | Should add |
| Console.log PII | MEDIUM | 36 files | 141 | Should replace with logger |
| S3 public URLs | MEDIUM | s3v2.service.ts | 27 | Should use signed URLs |
| Error leakage | MEDIUM | All controllers | Various | Add error handler |
| TypeScript any | LOW | index.ts, wsHandler.ts | Multiple | Should fix |
| No refresh tokens | LOW | auth.conroller.ts | Various | Recommended |
| No request logging | LOW | Middleware | Global | Recommended |
| Inconsistent lean() | LOW | Controllers | Various | Standardize |
| OAuth no PKCE | LOW | webhook.route.ts | 11-27 | Recommended |

---

## Recommendations for Next Steps

### Phase 1 (Immediate — Week 1)
1. Remove secrets from repo, rotate all credentials
2. Generate strong JWT_SECRET (32+ chars)
3. Add JWT token verification to WebSocket connection
4. Implement webhook signature verification for Meta
5. Add input validation (zod) to all request handlers
6. Add Helmet and CORS whitelist

### Phase 2 (High Priority — Week 2-3)
1. Implement rate limiting on auth and webhook endpoints
2. Fix contact/channel queries to filter by account_id
3. Add file upload MIME type validation
4. Use presigned S3 URLs instead of public URLs
5. Replace console.log with structured logging (Winston)
6. Add global error handler

### Phase 3 (Polish — Week 4)
1. Add database indexes for performance
2. Implement refresh token flow
3. Add OAuth2 PKCE to integrations
4. Add request/audit logging middleware
5. TypeScript type cleanup (remove any)
6. Integration tests for critical auth flows

---

## Testing Recommendations

Before production deployment, validate:
1. **Auth**: Token expiry, invalid token rejection, cross-account access blocked
2. **WebSocket**: Unauthed connection rejected, message routing only to intended account
3. **Webhooks**: Signature validation, rejection of unsigned payloads, idempotency
4. **File Upload**: MIME type enforcement, path traversal prevention
5. **Rate Limiting**: Login brute-force prevention, API flood protection
6. **Cross-Account**: No data leakage between accounts

---

**Review completed.** Prioritize Critical issues before any production use.
