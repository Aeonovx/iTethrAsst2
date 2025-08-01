// File: script.js
// Description: Corrected sidebar toggle logic for mobile.

document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const loginContainer = document.getElementById('login-container');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const chatContainer = document.getElementById('chat-container');
    const welcomeScreen = document.getElementById('welcome-screen');
    const welcomeTitle = document.getElementById('welcome-title');
    const welcomeSubtitle = document.getElementById('welcome-subtitle');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const menuToggle = document.querySelector('.menu-toggle');
    const sidebarOverlay = document.querySelector('.sidebar-overlay');

    let currentUser = null;

    // --- SESSION MANAGEMENT ---
    const checkSession = () => {
        const savedUser = sessionStorage.getItem('iTethrUser');
        if (savedUser) {
            currentUser = JSON.parse(savedUser);
            loginContainer.style.display = 'none';
            welcomeTitle.innerHTML = `Welcome back, <span class="primary-text">${currentUser.name}</span>!`;
            welcomeSubtitle.textContent = `As a ${currentUser.role}, what can I help you achieve today?`;
        } else {
            loginContainer.style.display = 'flex';
        }
    };

    // --- LOGIN LOGIC ---
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = usernameInput.value.trim();
        const password = passwordInput.value.trim();
        loginError.textContent = '';

        try {
            const response = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, password }),
            });

            if (response.ok) {
                const userData = await response.json();
                currentUser = { name: userData.username, role: userData.role };
                sessionStorage.setItem('iTethrUser', JSON.stringify(currentUser));
                checkSession();
            } else {
                loginError.textContent = 'Invalid credentials. Please try again.';
            }
        } catch (error) {
            console.error('Login error:', error);
            loginError.textContent = 'An error occurred. Please try again later.';
        }
    });

    // --- SIDEBAR TOGGLE (FIXED) ---
    menuToggle.addEventListener('click', () => {
        document.body.classList.toggle('sidebar-open');
    });

    sidebarOverlay.addEventListener('click', () => {
        document.body.classList.remove('sidebar-open');
    });

    // --- CHAT LOGIC ---
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const message = chatInput.value.trim();
        if (message) {
            appendMessage(message, 'user');
            // send message to backend and get response
            chatInput.value = '';
            welcomeScreen.style.display = 'none'; // Hide welcome screen on first message
        }
    });

    function appendMessage(text, sender) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('chat-message', sender);
        messageElement.textContent = text;
        chatContainer.appendChild(messageElement);
        chatContainer.scrollTop = chatContainer.scrollHeight; // Auto-scroll to bottom
    }

    // --- INITIALIZATION ---
    checkSession();
});