// File: web_ui/script.js
// [FIX] Implemented all user-requested features and bug fixes.

document.addEventListener("DOMContentLoaded", () => {
    // --- DOM Elements ---
    const loginContainer = document.getElementById('login-container');
    const appContainer = document.querySelector('.app-container');
    const loginForm = document.getElementById('login-form');
    const loginBtn = document.getElementById('login-btn');
    const loginError = document.getElementById('login-error');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');

    const chatContainer = document.getElementById('chat-container');
    const welcomeScreen = document.getElementById('welcome-screen');
    const welcomeTitle = document.getElementById('welcome-title');
    const welcomeSubtitle = document.getElementById('welcome-subtitle');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const suggestionChips = document.querySelector('.suggestion-chips');

    // [FIX] Get new elements
    const menuBtn = document.getElementById('menu-btn');
    const newChatBtn = document.getElementById('new-chat-btn');
    const userAvatarEl = document.getElementById('user-avatar');
    const userNameEl = document.getElementById('user-name');
    const userRoleEl = document.getElementById('user-role');


    let currentUser = null;
    let currentConvoId = null;

    // --- SESSION MANAGEMENT & UI UPDATE ---
    const setupUIForUser = (user) => {
        currentUser = user;
        // [FIX] Update user profile in sidebar
        userNameEl.textContent = user.name;
        userRoleEl.textContent = user.role;
        userAvatarEl.textContent = user.name.charAt(0).toUpperCase();

        welcomeTitle.innerHTML = `Welcome back, <span class="primary-text">${user.name}</span>!`;
        welcomeSubtitle.textContent = `As a ${user.role}, how can I assist you today?`;
        
        loginContainer.style.display = 'none';
        appContainer.style.display = 'flex';
    };
    
    const checkSession = () => {
        const savedUser = sessionStorage.getItem('iTethrUser');
        if (savedUser) {
            setupUIForUser(JSON.parse(savedUser));
        } else {
            loginContainer.style.display = 'flex';
            appContainer.style.display = 'none';
        }
    };

    // --- LOGIN LOGIC ---
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = usernameInput.value.trim();
        const password = passwordInput.value.trim();
        loginError.textContent = '';
        loginBtn.disabled = true;
        loginBtn.textContent = 'Authenticating...';

        try {
            const response = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, password }),
            });

            if (response.ok) {
                const userData = await response.json();
                sessionStorage.setItem('iTethrUser', JSON.stringify({ name: userData.username, role: userData.role }));
                setupUIForUser({ name: userData.username, role: userData.role });
            } else {
                const errorData = await response.json();
                loginError.textContent = errorData.detail || 'Invalid credentials. Please try again.';
            }
        } catch (error) {
            console.error('Login error:', error);
            loginError.textContent = 'Could not connect to the server. Please check your connection.';
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Authenticate';
        }
    });
    
    // --- CHAT FORM SUBMISSION ---
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const message = chatInput.value.trim();
        if (!message || !currentUser || sendBtn.disabled) return;
        
        welcomeScreen.style.display = 'none';
        appendMessage(message, 'user');
        chatInput.value = '';

        getBotResponseStream(message);
    });

    // --- STREAM HANDLING ---
    async function getBotResponseStream(message) {
        setChatInputDisabled(true);
        const botMessageElement = createBotMessageElement();

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: message,
                    username: currentUser.name,
                    convo_id: currentConvoId,
                    user_info: { name: currentUser.name, role: currentUser.role }
                }),
            });

            if (!response.body) return;

            const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
            let accumulatedResponse = '';
            let isFirstChunk = true;

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                const lines = value.split('\n');
                lines.forEach(line => {
                    if (line.trim()) {
                        try {
                            const data = JSON.parse(line);
                            if (isFirstChunk) {
                                botMessageElement.innerHTML = ''; // Clear typing indicator
                                isFirstChunk = false;
                            }
                            if (data.type === 'chunk' && data.content) {
                                accumulatedResponse += data.content;
                                botMessageElement.innerHTML = marked.parse(accumulatedResponse);
                            } else if (data.type === 'end') {
                                currentConvoId = data.convo_id;
                                addCopyButtonsToCode();
                            } else if (data.type === 'error') {
                                botMessageElement.innerHTML = `<p>Error: ${data.content}</p>`;
                            }
                        } catch (e) {
                            console.warn("Could not parse stream chunk: ", line);
                        }
                    }
                });
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }

        } catch (error) {
            botMessageElement.innerHTML = "<p>Error: Could not connect to the assistant. Please try again.</p>";
            console.error('Streaming error:', error);
        } finally {
            setChatInputDisabled(false);
        }
    }
    
    // --- UI HELPER FUNCTIONS ---
    function appendMessage(text, sender) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('chat-message', sender);
        messageElement.innerHTML = marked.parse(text);
        chatContainer.appendChild(messageElement);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        addCopyButtonsToCode();
    }

    function createBotMessageElement() {
        const messageElement = document.createElement('div');
        messageElement.classList.add('chat-message', 'bot');
        messageElement.innerHTML = `<div class="typing-indicator"><span></span><span></span><span></span></div>`;
        chatContainer.appendChild(messageElement);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        return messageElement;
    }

    function setChatInputDisabled(disabled) {
        chatInput.disabled = disabled;
        sendBtn.disabled = disabled;
        chatInput.placeholder = disabled ? "Assistant is typing..." : "Ask anything...";
    }

    // --- [FIX] Event Listeners for New Buttons ---
    newChatBtn.addEventListener('click', () => {
        chatContainer.innerHTML = ''; // Clear chat
        chatContainer.appendChild(welcomeScreen);
        welcomeScreen.style.display = 'flex';
        currentConvoId = null; // Reset conversation
    });

    menuBtn.addEventListener('click', () => {
        appContainer.classList.toggle('sidebar-visible');
    });

    suggestionChips.addEventListener('click', (e) => {
        if (e.target.tagName === 'SPAN') {
            chatInput.value = e.target.textContent;
            chatForm.dispatchEvent(new Event('submit'));
        }
    });

    function addCopyButtonsToCode() { /* ... function remains the same ... */ }

    // --- INITIALIZATION ---
    checkSession();
});