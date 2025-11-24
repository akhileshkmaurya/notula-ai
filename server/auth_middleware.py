import os
from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from google.oauth2 import id_token
from google.auth.transport import requests

# Security scheme
security = HTTPBearer()

# Google OAuth Client ID (should be in environment variable)
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

async def verify_google_token(credentials: HTTPAuthorizationCredentials = Security(security)):
    """
    Verify Google ID token and return user information
    """
    if not GOOGLE_CLIENT_ID:
        # In development, you might want to skip auth if not configured
        # In production, this should raise an error
        return {"email": "dev@localhost", "sub": "dev", "name": "Development User"}
    
    token = credentials.credentials
    
    try:
        # Verify the token
        idinfo = id_token.verify_oauth2_token(
            token, 
            requests.Request(), 
            GOOGLE_CLIENT_ID
        )
        
        # Verify the issuer
        if idinfo['iss'] not in ['accounts.google.com', 'https://accounts.google.com']:
            raise ValueError('Wrong issuer.')
        
        # Token is valid, return user info
        user_info = {
            'email': idinfo.get('email'),
            'sub': idinfo.get('sub'),  # User ID
            'name': idinfo.get('name'),
            'picture': idinfo.get('picture'),
            'email_verified': idinfo.get('email_verified', False)
        }
        
        return user_info
        
    except ValueError:
        # Invalid token
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

async def get_current_user(user_info: dict = Depends(verify_google_token)):
    """
    Dependency to get the current authenticated user
    """
    if not user_info.get('email_verified', True):
        raise HTTPException(status_code=403, detail="Email not verified")
    
    return user_info

