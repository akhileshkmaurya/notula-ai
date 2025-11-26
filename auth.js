const crypto = require('crypto');
const http = require('http');
const url = require('url');
const axios = require('axios');
const { shell, app } = require('electron');
const fs = require('fs');
const path = require('path');

class GoogleAuthService {
  constructor() {
    this.accessToken = null;
    this.refreshToken = null;
    this.idToken = null;
    this.userInfo = null;
    this.tokenPath = null;
    this.settingsPath = null;
    this.geminiApiKey = null;

    // These should be set in .env file
    this.clientId = process.env.GOOGLE_CLIENT_ID;
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    this.redirectUri = 'http://localhost:3000/callback';

    // Google OAuth endpoints
    this.authEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
    this.tokenEndpoint = 'https://oauth2.googleapis.com/token';
    this.userInfoEndpoint = 'https://www.googleapis.com/oauth2/v2/userinfo';
  }

  // Initialize storage path
  init() {
    if (!this.tokenPath) {
      this.tokenPath = path.join(app.getPath('userData'), 'auth_session.json');
    }
    if (!this.settingsPath) {
      this.settingsPath = path.join(app.getPath('userData'), 'settings.json');
    }
  }

  // Load settings (API Key)
  loadSettings() {
    this.init();
    try {
      if (fs.existsSync(this.settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(this.settingsPath, 'utf8'));
        this.geminiApiKey = settings.geminiApiKey;
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }

  // Save settings
  saveSettings() {
    this.init();
    const settings = {
      geminiApiKey: this.geminiApiKey
    };
    try {
      fs.writeFileSync(this.settingsPath, JSON.stringify(settings));
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  }

  // Save session to disk
  saveSession() {
    this.init();
    const session = {
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      idToken: this.idToken,
      userInfo: this.userInfo
    };
    try {
      fs.writeFileSync(this.tokenPath, JSON.stringify(session));
    } catch (err) {
      console.error('Failed to save session:', err);
    }
  }

  // Load session from disk
  loadSession() {
    this.init();
    try {
      if (fs.existsSync(this.tokenPath)) {
        const session = JSON.parse(fs.readFileSync(this.tokenPath, 'utf8'));
        this.accessToken = session.accessToken;
        this.refreshToken = session.refreshToken;
        this.idToken = session.idToken;
        this.userInfo = session.userInfo;
        // Load settings separately
        this.loadSettings();
        return true;
      }
    } catch (err) {
      console.error('Failed to load session:', err);
    }
    return false;
  }

  // Generate random string for state and code verifier
  generateRandomString(length = 43) {
    return crypto.randomBytes(length).toString('base64url');
  }

  // Generate code challenge from verifier (PKCE)
  generateCodeChallenge(verifier) {
    return crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url');
  }

  async login() {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Google OAuth credentials not found in .env file. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET');
    }

    const state = this.generateRandomString();
    const codeVerifier = this.generateRandomString();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);

    // Build authorization URL
    const authParams = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const authUrl = `${this.authEndpoint}?${authParams.toString()}`;

    return new Promise((resolve, reject) => {
      // Create a local server to handle the OAuth callback
      const server = http.createServer(async (req, res) => {
        const parsedUrl = url.parse(req.url, true);

        if (parsedUrl.pathname === '/callback') {
          const { code, state: returnedState, error } = parsedUrl.query;

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <head>
                  <style>
                    body {
                      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      height: 100vh;
                      margin: 0;
                      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    }
                    .error-box {
                      background: white;
                      padding: 40px;
                      border-radius: 20px;
                      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                      text-align: center;
                    }
                    h1 { color: #c53030; margin-bottom: 10px; }
                    p { color: #718096; }
                  </style>
                </head>
                <body>
                  <div class="error-box">
                    <h1>✗ Authentication Failed</h1>
                    <p>${error}</p>
                  </div>
                </body>
              </html>
            `);
            server.close();
            reject(new Error(error));
            return;
          }

          if (returnedState !== state) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<html><body><h1>State mismatch error</h1></body></html>');
            server.close();
            reject(new Error('State mismatch'));
            return;
          }

          try {
            // Exchange authorization code for tokens
            const tokenResponse = await axios.post(this.tokenEndpoint, new URLSearchParams({
              client_id: this.clientId,
              client_secret: this.clientSecret,
              code: code,
              code_verifier: codeVerifier,
              grant_type: 'authorization_code',
              redirect_uri: this.redirectUri,
            }), {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
            });

            this.accessToken = tokenResponse.data.access_token;
            this.refreshToken = tokenResponse.data.refresh_token;
            this.idToken = tokenResponse.data.id_token;

            // Get user info
            const userInfoResponse = await axios.get(this.userInfoEndpoint, {
              headers: {
                'Authorization': `Bearer ${this.accessToken}`,
              },
            });

            this.userInfo = userInfoResponse.data;

            // Save session
            this.saveSession();

            // Send success response to browser
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <head>
                  <style>
                    body {
                      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      height: 100vh;
                      margin: 0;
                      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    }
                    .success-box {
                      background: white;
                      padding: 40px;
                      border-radius: 20px;
                      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                      text-align: center;
                    }
                    h1 { color: #22543d; margin-bottom: 10px; }
                    p { color: #718096; }
                  </style>
                </head>
                <body>
                  <div class="success-box">
                    <h1>✓ Authentication Successful!</h1>
                    <p>Welcome, ${this.userInfo.name || this.userInfo.email}!</p>
                    <p>You can close this window now.</p>
                  </div>
                  <script>setTimeout(() => window.close(), 2000);</script>
                </body>
              </html>
            `);

            server.close();
            resolve({
              success: true,
              accessToken: this.accessToken,
              idToken: this.idToken,
              userInfo: this.userInfo,
            });
          } catch (err) {
            console.error('OAuth token exchange error:', err);
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body>
                  <h1>Authentication Failed</h1>
                  <p>${err.message}</p>
                </body>
              </html>
            `);
            server.close();
            reject(err);
          }
        }
      });

      server.listen(3000, () => {
        console.log('OAuth callback server listening on port 3000');

        // Open the authorization URL in the default browser
        shell.openExternal(authUrl);
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        reject(new Error('Authentication timeout'));
      }, 5 * 60 * 1000);
    });
  }

  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const tokenResponse = await axios.post(this.tokenEndpoint, new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token',
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      this.accessToken = tokenResponse.data.access_token;
      this.idToken = tokenResponse.data.id_token;

      // Update session
      this.saveSession();

      return this.accessToken;
    } catch (err) {
      console.error('Token refresh error:', err);
      throw err;
    }
  }

  getAccessToken() {
    return this.accessToken;
  }

  getIdToken() {
    return this.idToken;
  }

  getUserInfo() {
    return this.userInfo;
  }

  isAuthenticated() {
    return !!this.accessToken;
  }

  logout() {
    this.accessToken = null;
    this.refreshToken = null;
    this.idToken = null;
    this.userInfo = null;
    // Do NOT clear geminiApiKey on logout
    // this.geminiApiKey = null;

    // Remove session file
    this.init();
    try {
      if (fs.existsSync(this.tokenPath)) {
        fs.unlinkSync(this.tokenPath);
      }
    } catch (err) {
      console.error('Failed to clear session:', err);
    }
  }

  setGeminiApiKey(key) {
    this.geminiApiKey = key;
    this.saveSettings();
  }

  getGeminiApiKey() {
    return this.geminiApiKey;
  }
}

module.exports = new GoogleAuthService();
