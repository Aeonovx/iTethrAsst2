// web_ui/static/script.js

document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const loginContainer = document.getElementById('login-container');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');

    const appContainer = document.querySelector('.app-container');
    const chatContainer = document.getElementById('chat-container');
    const welcomeScreen = document.getElementById('welcome-screen');
    const welcomeTitle = document.getElementById('welcome-title');
    const welcomeSubtitle = document.getElementById('welcome-subtitle');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const suggestionChips = document.querySelector('.suggestion-chips');

    let currentUser = null;

    // --- SESSION MANAGEMENT ---
    const checkSession = () => {
        const savedUser = sessionStorage.getItem('iTethrUser');
        if (savedUser) {
            currentUser = JSON.parse(savedUser);
            loginContainer.style.display = 'none';
            appContainer.style.display = 'flex';
            welcomeTitle.innerHTML = `Welcome back, <span class="primary-text">${currentUser.name}</span>!`;
            welcomeSubtitle.textContent = `As a ${currentUser.role}, how can I assist you today?`;
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
            loginError.textContent = 'An error occurred. Please check the server connection.';
        }
    });
    
    // --- CHAT FORM SUBMISSION ---
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const message = chatInput.value.trim();
        if (!message || !currentUser) return;
        
        // Hide welcome screen and display user message
        welcomeScreen.style.display = 'none';
        appendMessage(message, 'user');
        chatInput.value = '';

        // Initiate stream with the backend
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
                body: JSON.stringify({ message: message, username: currentUser.name }),
            });

            if (!response.body) return;

            const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
            let accumulatedResponse = '';

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                
                accumulatedResponse += value;
                // Use marked.js to parse markdown in real-time
                botMessageElement.innerHTML = marked.parse(accumulatedResponse);
                
                // Scroll to the bottom of the chat
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }
            // Add copy buttons to any new code blocks
            addCopyButtonsToCode();

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
        // Use marked.parse for user messages too, in case they paste markdown
        messageElement.innerHTML = marked.parse(text);
        chatContainer.appendChild(messageElement);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function createBotMessageElement() {
        const messageElement = document.createElement('div');
        messageElement.classList.add('chat-message', 'bot');
        // Add a typing indicator
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
            // Avoid adding a button if it already has one
            if (block.nextElementSibling && block.nextElementSibling.classList.contains('copy-btn')) {
                return;
            }
            const copyButton = document.createElement('button');
            copyButton.className = 'copy-btn';
            copyButton.innerHTML = '<i class="far fa-copy"></i> Copy';
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