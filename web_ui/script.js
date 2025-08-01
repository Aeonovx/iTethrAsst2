// File: web_ui/script.js
// [FINAL FIX] Implemented correct line-by-line JSON stream parsing.

document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
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
                loginError.textContent = errorData.detail || 'Invalid credentials.';
            }
        } catch (error) {
            console.error('Login error:', error);
            loginError.textContent = 'Could not connect to the server.';
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

        if (!currentUser || !currentUser.name) {
            botMessageElement.innerHTML = "<p>Error: User session invalid. Please log in again.</p>";
            setChatInputDisabled(false);
            return;
        }

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

            if (!response.ok) {
                let errorText = `Error: ${response.status} ${response.statusText}`;
                try {
                    const errorJson = await response.json();
                    errorText = `Error: ${JSON.stringify(errorJson.detail)}`;
                } catch (e) {}
                throw new Error(errorText);
            }

            if (!response.body) return;

            // [CRITICAL FIX] Implement proper line-by-line stream parsing
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let accumulatedContent = '';
            let isFirstChunk = true;

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                if (isFirstChunk) {
                    botMessageElement.innerHTML = ''; 
                    isFirstChunk = false;
                }
                
                buffer += decoder.decode(value, { stream: true });
                let boundary;

                while ((boundary = buffer.indexOf('\n')) !== -1) {
                    const line = buffer.substring(0, boundary).trim();
                    buffer = buffer.substring(boundary + 1);

                    if (line) {
                        try {
                            const data = JSON.parse(line);
                            if (data.type === 'chunk' && data.content) {
                                accumulatedContent += data.content;
                            } else if (data.type === 'end') {
                                currentConvoId = data.convo_id;
                            }
                        } catch (e) {
                            console.warn("Could not parse stream line: ", line, e);
                        }
                    }
                }
                botMessageElement.innerHTML = marked.parse(accumulatedContent);
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }
            addCopyButtonsToCode();

        } catch (error) {
            botMessageElement.innerHTML = `<p>${error.message}</p>`;
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

    // --- EVENT LISTENERS FOR BUTTONS ---
    newChatBtn.addEventListener('click', () => {
        chatContainer.innerHTML = '';
        chatContainer.appendChild(welcomeScreen);
        welcomeScreen.style.display = 'flex';
        currentConvoId = null;
    });

    menuBtn.addEventListener('click', () => {
        appContainer.classList.toggle('sidebar-visible');
    });

    suggestionChips.addEventListener('click', (e) => {
        if (e.target.tagName === 'SPAN') {
            chatInput.value = e.target.textContent;
            chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
        }
    });

    function addCopyButtonsToCode() {
        document.querySelectorAll('pre code').forEach(block => {
            if (block.parentNode.querySelector('.copy-btn')) return;
            const copyButton = document.createElement('button');
            copyButton.className = 'copy-btn';
            copyButton.innerHTML = '<i class="far fa-copy"></i> Copy';
            block.parentNode.style.position = 'relative';
            block.parentNode.appendChild(copyButton);
            copyButton.addEventListener('click', () => {
                navigator.clipboard.writeText(block.textContent).then(() => {
                    copyButton.innerHTML = '<i class="fas fa-check"></i> Copied!';
                    setTimeout(() => { copyButton.innerHTML = '<i class="far fa-copy"></i> Copy'; }, 2000);
                });
            });
        });
    }

    checkSession();
});