// File: web_ui/script.js
// [FIX] Corrected DOM element IDs to match index.html (login-container, app-container).
// [FIX] Made stream processing robust by adding error handling.
// [IMPROVEMENT] Added UI feedback during login and message sending.

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

    let currentUser = null;
    let currentConvoId = null;

    // --- SESSION MANAGEMENT ---
    const checkSession = () => {
        const savedUser = sessionStorage.getItem('iTethrUser');
        if (savedUser) {
            currentUser = JSON.parse(savedUser);
            // [FIX] Use correct container IDs
            loginContainer.style.display = 'none';
            appContainer.style.display = 'flex';
            welcomeTitle.innerHTML = `Welcome back, <span class="primary-text">${currentUser.name}</span>!`;
            welcomeSubtitle.textContent = `As a ${currentUser.role}, how can I assist you today?`;
        } else {
            // [FIX] Use correct container IDs
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
                currentUser = { name: userData.username, role: userData.role };
                sessionStorage.setItem('iTethrUser', JSON.stringify(currentUser));
                checkSession(); // This will hide login and show the app
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
        if (!message || !currentUser) return;
        
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

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                // Robustly handle potentially incomplete JSON chunks
                const lines = value.split('\n');
                lines.forEach(line => {
                    if (line.trim()) {
                        try {
                            const data = JSON.parse(line);
                            if (data.type === 'chunk' && data.content) {
                                accumulatedResponse += data.content;
                                botMessageElement.innerHTML = marked.parse(accumulatedResponse);
                                chatContainer.scrollTop = chatContainer.scrollHeight;
                            } else if (data.type === 'end') {
                                currentConvoId = data.convo_id;
                                addCopyButtonsToCode();
                            } else if (data.type === 'error') {
                                botMessageElement.innerHTML = `Error: ${data.content}`;
                            }
                        } catch (e) {
                            console.warn("Could not parse stream chunk: ", line);
                        }
                    }
                });
            }

        } catch (error) {
            botMessageElement.innerHTML = "Error: Could not connect to the assistant. Please try again.";
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
        if(sender === 'user') addCopyButtonsToCode(); // Check for markdown in user message
    }

    function createBotMessageElement() {
        const messageElement = document.createElement('div');
        messageElement.classList.add('chat-message', 'bot');
        messageElement.innerHTML = '<span class="typing-indicator"></span>';
        chatContainer.appendChild(messageElement);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        return messageElement;
    }

    function setChatInputDisabled(disabled) {
        chatInput.disabled = disabled;
        sendBtn.disabled = disabled;
        chatInput.placeholder = disabled ? "Assistant is typing..." : "Ask anything...";
    }

    suggestionChips.addEventListener('click', (e) => {
        if (e.target.tagName === 'SPAN') {
            chatInput.value = e.target.textContent;
            chatInput.focus();
        }
    });

    // --- CODE BLOCK ENHANCEMENT ---
    function addCopyButtonsToCode() {
        const codeBlocks = document.querySelectorAll('pre code');
        codeBlocks.forEach(block => {
            if (block.nextElementSibling && block.nextElementSibling.classList.contains('copy-btn')) {
                return;
            }
            const copyButton = document.createElement('button');
            copyButton.className = 'copy-btn';
            copyButton.innerHTML = '<i class="far fa-copy"></i> Copy';
            block.parentNode.style.position = 'relative'; // Needed for button positioning
            block.parentNode.appendChild(copyButton);

            copyButton.addEventListener('click', () => {
                navigator.clipboard.writeText(block.textContent).then(() => {
                    copyButton.innerHTML = '<i class="fas fa-check"></i> Copied!';
                    setTimeout(() => {
                         copyButton.innerHTML = '<i class="far fa-copy"></i> Copy';
                    }, 2000);
                });
            });
        });
    }

    // --- INITIALIZATION ---
    checkSession();
});