# Google Authentication Setup Guide

This guide will help you set up Google OAuth authentication for both the Electron client and Python server.

## Prerequisites

- Google Cloud Platform account
- Node.js and npm installed
- Python 3.8+ with pip

## Step 1: Create Google OAuth Credentials

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/

2. **Create or Select a Project**
   - Click on the project dropdown at the top
   - Create a new project or select an existing one

3. **Enable Google+ API**
   - Go to "APIs & Services" > "Library"
   - Search for "Google+ API"
   - Click "Enable"

4. **Create OAuth 2.0 Credentials**
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Choose "Desktop application" as the application type
   - Give it a name (e.g., "Notula AI Desktop")
   - Click "Create"

5. **Configure Authorized Redirect URIs**
   - After creating, click on your OAuth client
   - Add the following to "Authorized redirect URIs":
     ```
     http://localhost:3000/callback
     ```
   - Click "Save"

6. **Download Credentials**
   - You'll see your Client ID and Client Secret
   - Copy these values for the next step

## Step 2: Configure Client Application

1. **Update .env file in the root directory**
   ```bash
   cd /home/legion/project91/notula-ai
   cp .env.example .env
   nano .env
   ```

2. **Add your credentials**
   ```env
   GOOGLE_CLIENT_ID=your_actual_client_id_here
   GOOGLE_CLIENT_SECRET=your_actual_client_secret_here
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

## Step 3: Configure Server Application

1. **Update .env file in the server directory**
   ```bash
   cd /home/legion/project91/notula-ai/server
   cp .env.example .env
   nano .env
   ```

2. **Add your Google Client ID**
   ```env
   GOOGLE_CLIENT_ID=your_actual_client_id_here
   WHISPER_MODEL=base
   ```

3. **Install Python dependencies**
   ```bash
   source venv/bin/activate
   pip install -r requirements.txt
   ```

## Step 4: Test the Authentication

1. **Start the server**
   ```bash
   cd /home/legion/project91/notula-ai/server
   source venv/bin/activate
   python app.py
   ```

2. **Start the client (in a new terminal)**
   ```bash
   cd /home/legion/project91/notula-ai
   npm start
   ```

3. **Test the login flow**
   - The login window should appear
   - Click "Sign in with Google"
   - Your default browser will open
   - Sign in with your Google account
   - Grant permissions to the app
   - You should be redirected back and the main app window should open

## Authentication Flow

### Client Side (Electron)
1. User clicks "Sign in with Google"
2. App opens browser with Google OAuth URL
3. User authenticates and grants permissions
4. Google redirects to `http://localhost:3000/callback`
5. Local server captures the authorization code
6. App exchanges code for access token and ID token
7. ID token is stored and used for API requests

### Server Side (Python/FastAPI)
1. Client sends ID token in Authorization header
2. Server verifies token with Google
3. Extracts user information (email, name, etc.)
4. Processes the request if token is valid
5. Returns 401 if token is invalid or missing

## Security Notes

- **Never commit your .env file** - It's already in .gitignore
- **ID tokens expire** - The client will need to refresh them periodically
- **Use HTTPS in production** - The current setup uses HTTP for local development
- **Restrict API access** - In production, limit the OAuth redirect URIs to your domain

## Troubleshooting

### "Missing GOOGLE_CLIENT_ID" error
- Make sure you've created the .env file in both root and server directories
- Verify the credentials are correctly copied from Google Cloud Console

### "Invalid redirect URI" error
- Check that `http://localhost:3000/callback` is added to authorized redirect URIs
- Make sure there are no trailing slashes or extra spaces

### "Token verification failed" error
- Ensure the GOOGLE_CLIENT_ID in the server .env matches the one used in the client
- Check that the token hasn't expired
- Verify your system clock is correct

### Browser doesn't open for login
- Check if port 3000 is available
- Try running the app with elevated permissions
- Check your default browser settings

## Development Mode

For development without authentication, you can temporarily disable it:

**Server side**: The auth middleware will use a development user if `GOOGLE_CLIENT_ID` is not set.

**Client side**: You would need to modify the code to skip the login window.

## Production Deployment

For production deployment:

1. Update redirect URIs to use your production domain
2. Use HTTPS for all communications
3. Implement token refresh logic
4. Add rate limiting to prevent abuse
5. Store refresh tokens securely
6. Implement proper session management
7. Add logging and monitoring

## Additional Resources

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [FastAPI Security Documentation](https://fastapi.tiangolo.com/tutorial/security/)
- [Electron Security Best Practices](https://www.electronjs.org/docs/latest/tutorial/security)
