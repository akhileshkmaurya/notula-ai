# Authentication Architecture

## System Architecture with Google OAuth

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         NOTULA AI ARCHITECTURE                          │
│                      (with Google Authentication)                       │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐
│   ELECTRON CLIENT    │
│  (Desktop App)       │
└──────────────────────┘
         │
         │ 1. User starts app
         ▼
┌──────────────────────┐
│   LOGIN WINDOW       │
│  - login.html        │
│  - Google Sign-in    │
└──────────────────────┘
         │
         │ 2. Click "Sign in with Google"
         ▼
┌──────────────────────┐
│   AUTH SERVICE       │
│  - auth.js           │
│  - PKCE Flow         │
│  - openid-client     │
└──────────────────────┘
         │
         │ 3. Opens browser
         ▼
┌──────────────────────────────────────────┐
│         GOOGLE OAUTH 2.0                 │
│  - User authenticates                    │
│  - Grants permissions                    │
│  - Returns authorization code            │
└──────────────────────────────────────────┘
         │
         │ 4. Callback to localhost:3000
         ▼
┌──────────────────────┐
│   AUTH SERVICE       │
│  - Exchanges code    │
│  - Gets tokens       │
│  - Stores ID token   │
└──────────────────────┘
         │
         │ 5. Login successful
         ▼
┌──────────────────────┐
│   MAIN WINDOW        │
│  - index.html        │
│  - Recording UI      │
└──────────────────────┘
         │
         │ 6. Record audio
         ▼
┌──────────────────────┐
│   MAIN PROCESS       │
│  - main.js           │
│  - Captures audio    │
│  - Chunks audio      │
└──────────────────────┘
         │
         │ 7. POST /transcribe
         │    Authorization: Bearer <ID_TOKEN>
         ▼
┌─────────────────────────────────────────────────────┐
│              FASTAPI SERVER                         │
│  ┌───────────────────────────────────────────────┐  │
│  │  AUTH MIDDLEWARE (auth_middleware.py)         │  │
│  │  - Extracts Bearer token                      │  │
│  │  - Verifies with Google                       │  │
│  │  - Returns user info                          │  │
│  └───────────────────────────────────────────────┘  │
│                       │                             │
│                       │ 8. Token valid              │
│                       ▼                             │
│  ┌───────────────────────────────────────────────┐  │
│  │  TRANSCRIBE ENDPOINT (app.py)                 │  │
│  │  - Receives authenticated request             │  │
│  │  - Processes audio with Whisper               │  │
│  │  - Returns transcript                         │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
         │
         │ 9. Returns transcript
         ▼
┌──────────────────────┐
│   MAIN WINDOW        │
│  - Displays text     │
│  - Real-time updates │
└──────────────────────┘


═══════════════════════════════════════════════════════════════════════════
                            SECURITY FLOW
═══════════════════════════════════════════════════════════════════════════

CLIENT AUTHENTICATION:
┌─────────────────────────────────────────────────────────────────────┐
│ 1. PKCE Flow (Proof Key for Code Exchange)                         │
│    - Generates code_verifier and code_challenge                     │
│    - More secure than traditional OAuth for desktop apps            │
│                                                                     │
│ 2. Authorization Code Exchange                                      │
│    - Exchanges code for access_token and id_token                   │
│    - Tokens stored in memory (not persisted)                        │
│                                                                     │
│ 3. API Requests                                                     │
│    - ID token sent in Authorization header                          │
│    - Format: "Authorization: Bearer <id_token>"                     │
└─────────────────────────────────────────────────────────────────────┘

SERVER AUTHENTICATION:
┌─────────────────────────────────────────────────────────────────────┐
│ 1. Token Extraction                                                 │
│    - HTTPBearer security scheme extracts token                      │
│                                                                     │
│ 2. Token Verification                                               │
│    - Verifies signature with Google's public keys                   │
│    - Checks issuer (accounts.google.com)                            │
│    - Validates expiration                                           │
│    - Confirms audience (GOOGLE_CLIENT_ID)                           │
│                                                                     │
│ 3. User Information                                                 │
│    - Extracts email, name, sub (user ID)                            │
│    - Checks email_verified status                                   │
│    - Returns user info to endpoint                                  │
│                                                                     │
│ 4. Request Processing                                               │
│    - Endpoint receives authenticated user info                      │
│    - Logs user email for audit trail                                │
│    - Processes request normally                                     │
└─────────────────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════════════
                            FILE STRUCTURE
═══════════════════════════════════════════════════════════════════════════

CLIENT FILES:
├── login.html              # Login page UI
├── login.css               # Login page styling
├── login.js                # Login page logic
├── auth.js                 # OAuth service (PKCE flow)
├── main.js                 # Modified: Auth integration, token headers
├── preload.js              # Modified: Exposed googleLogin API
├── .env                    # GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
└── package.json            # Added: openid-client

SERVER FILES:
├── server/
│   ├── app.py              # Modified: Protected endpoints
│   ├── auth_middleware.py  # NEW: Token verification
│   ├── requirements.txt    # Added: google-auth, python-jose
│   └── .env                # GOOGLE_CLIENT_ID

DOCUMENTATION:
├── AUTHENTICATION_SETUP.md # Complete setup guide
├── IMPLEMENTATION_SUMMARY.md # What was implemented
├── README.md               # Updated with auth info
├── .env.example            # Template for client
├── server/.env.example     # Template for server
└── setup-auth.sh           # Quick setup script


═══════════════════════════════════════════════════════════════════════════
                        ENVIRONMENT VARIABLES
═══════════════════════════════════════════════════════════════════════════

CLIENT (.env):
┌─────────────────────────────────────────────────────────────────────┐
│ GOOGLE_CLIENT_ID=<from Google Cloud Console>                       │
│ GOOGLE_CLIENT_SECRET=<from Google Cloud Console>                   │
│ GEMINI_API_KEY=<for AI summarization>                              │
└─────────────────────────────────────────────────────────────────────┘

SERVER (server/.env):
┌─────────────────────────────────────────────────────────────────────┐
│ GOOGLE_CLIENT_ID=<same as client>                                  │
│ WHISPER_MODEL=base                                                 │
└─────────────────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════════════
                            KEY FEATURES
═══════════════════════════════════════════════════════════════════════════

✓ OAuth 2.0 with PKCE (Proof Key for Code Exchange)
✓ Secure token verification on server
✓ Bearer token authentication
✓ User information extraction (email, name)
✓ Email verification check
✓ Audit logging (user email in server logs)
✓ Development mode (optional auth bypass)
✓ Beautiful login UI with Google branding
✓ Comprehensive error handling
✓ Detailed documentation and setup guides
✓ Environment variable management
✓ Production-ready architecture
