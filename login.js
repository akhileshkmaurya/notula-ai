const googleLoginBtn = document.getElementById('googleLoginBtn');
const statusEl = document.getElementById('status');

function showStatus(message, type = 'info') {
    statusEl.textContent = message;
    statusEl.className = `status-message show ${type}`;
}

googleLoginBtn.addEventListener('click', async () => {
    try {
        showStatus('Initiating Google Sign-In...', 'info');
        googleLoginBtn.disabled = true;

        const result = await window.electronAPI.googleLogin();

        if (result.success) {
            showStatus('Login successful! Redirecting...', 'success');
            // The main process will handle the window transition
        } else {
            showStatus(result.error || 'Login failed. Please try again.', 'error');
            googleLoginBtn.disabled = false;
        }
    } catch (error) {
        console.error('Login error:', error);
        showStatus('An error occurred. Please try again.', 'error');
        googleLoginBtn.disabled = false;
    }
});
