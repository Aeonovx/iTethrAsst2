// File: script.js
// Description: The core frontend logic.
// Updated for theming, responsiveness, tool integration, and personalization.

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const loginScreen = document.getElementById('login-screen');
    const chatScreen = document.getElementById('chat-screen');
    const loginForm = document.getElementById('login-form');
    const nameInput = document.getElementById('name');
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('login-error');
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const chatMessages = document.getElementById('chat-messages');
    const userInfo = document.getElementById('user-info');
    const logoutButton = document.getElementById('logout-button');
    const conversationHistory = document.getElementById('conversation-history');
    const welcomeMessage = document.getElementById('welcome-message');
    const welcomeTitle = document.getElementById('welcome-title');
    const welcomeSubtitle = document.getElementById('welcome-subtitle');
    const newChatButton = document.getElementById('new-chat-button');
    const copyConvoButton = document.getElementById('copy-convo-button');
    const themeToggle = document.getElementById('theme-toggle');

    // --- State Management ---
    let currentUser = null;
    let currentConversationId = null;

    // --- [NEW] Theme Management ---
    const applyTheme = (theme) => {
        document.body.classList.remove('light-theme', 'dark-theme');
        document.body.classList.add(theme);
        themeToggle.checked = theme === 'dark-theme';
    };

    themeToggle.addEventListener('change', () => {
        const newTheme = themeToggle.checked ? 'dark-theme' : 'light-theme';
        localStorage.setItem('iTethrTheme', newTheme);
        applyTheme(newTheme);
    });

    const savedTheme = localStorage.getItem('iTethrTheme') || 'dark-theme';
    applyTheme(savedTheme);


    // --- Functions ---
    const scrollToBottom = () => { chatMessages.scrollTop = chatMessages.scrollHeight; };

    const addCopyButtonsToCode = (messageElement) => {
        messageElement.querySelectorAll('pre').forEach(pre => {
            if (pre.querySelector('.copy-code-button')) return; // Don't add twice
            const button = document.createElement('button');
            button.className = 'copy-code-button';
            button.textContent = 'Copy';
            button.onclick = () => {
                const code = pre.querySelector('code').innerText;
                navigator.clipboard.writeText(code).then(() => {
                    button.textContent = 'Copied!';
                    setTimeout(() => { button.textContent = 'Copy'; }, 2000);
                });
            };
            pre.appendChild(button);
        });
    };
    
    // [CHANGE] Modified to handle the new thinking indicator
    const appendMessage = (sender, text) => {
        if (welcomeMessage) welcomeMessage.style.display = 'none';
        chatMessages.style.display = 'flex';

        const messageWrapper = document.createElement('div');
        messageWrapper.className = `message-wrapper ${sender}`;

        const avatar = document.createElement('div');
        avatar.className = `avatar ${sender}-avatar`;
        avatar.textContent = sender === 'user' ? (currentUser?.name.charAt(0).toUpperCase() || 'U') : 'B';
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        const parsedHtml = marked.parse(text, {
            highlight: function (code, lang) {
                const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                return hljs.highlight(code, { language }).value;
            },
            gfm: true,
            tables: true
        });
        messageContent.innerHTML = parsedHtml;

        messageWrapper.appendChild(avatar);
        messageWrapper.appendChild(messageContent);
        chatMessages.appendChild(messageWrapper);
        
        scrollToBottom();
        return messageContent;
    };
    
    // [CHANGE] New, clearer thinking indicator
    const showThinkingIndicator = () => {
        if (welcomeMessage) welcomeMessage.style.display = 'none';
        chatMessages.style.display = 'flex';

        if (document.getElementById('thinking-indicator')) return; // Already exists

        const indicatorWrapper = document.createElement('div');
        indicatorWrapper.className = 'message-wrapper bot';
        indicatorWrapper.id = 'thinking-indicator';

        const avatar = document.createElement('div');
        avatar.className = 'avatar bot-avatar';
        avatar.textContent = 'B';

        const indicatorContent = document.createElement('div');
        indicatorContent.className = 'message-content';
        indicatorContent.innerHTML = `<div class="thinking-indicator-dots"><span></span><span></span><span></span></div>`;

        indicatorWrapper.appendChild(avatar);
        indicatorWrapper.appendChild(indicatorContent);
        chatMessages.appendChild(indicatorWrapper);
        scrollToBottom();
    };

    const loadConversationHistory = async () => { /* ... (no changes) ... */ };
    const loadConversation = async (convoId) => { /* ... (no changes) ... */ };

    // [CHANGE] Added confirmation dialog
    const startNewChat = () => {
        if (currentConversationId && chatMessages.children.length > 1) {
            if (!confirm("Are you sure you want to start a new chat? The current conversation will be saved.")) {
                return;
            }
        }
        currentConversationId = null;
        chatMessages.innerHTML = '';
        chatMessages.style.display = 'none';
        welcomeMessage.style.display = 'flex';
        messageInput.value = '';
        document.querySelectorAll('.conversation-item.active').forEach(el => el.classList.remove('active'));
    };

    // [CHANGE] Handles personalized welcome
    const handleLogin = async (e) => {
        e.preventDefault();
        const name = nameInput.value.trim();
        const password = passwordInput.value.trim();
        try {
            const response = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, password }),
            });
            if (response.ok) {
                const data = await response.json();
                currentUser = { name: data.username, role: data.role };
                sessionStorage.setItem('iTethrUser', JSON.stringify(currentUser));
                
                loginScreen.classList.remove('active');
                chatScreen.classList.add('active');
                
                userInfo.textContent = `${currentUser.name}`;
                welcomeTitle.textContent = `Welcome, ${currentUser.name}!`;
                welcomeSubtitle.textContent = `iTethr Assistant, ready for your commands, ${currentUser.role}.`;

                await loadConversationHistory();
                startNewChat();
            } else {
                loginError.textContent = 'Invalid name or password.';
            }
        } catch (error) {
            loginError.textContent = 'An error occurred during login.';
        }
    };
    
    const handleSendMessage = async (e) => {
        e.preventDefault();
        const message = messageInput.value.trim();
        if (!message || !currentUser) return;

        appendMessage('user', message);
        messageInput.value = '';
        autoResizeTextarea();
        sendButton.disabled = true;

        showThinkingIndicator();
        
        let botMessageContent;
        let fullResponse = "";

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, username: currentUser.name, convo_id: currentConversationId }),
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            const thinkingIndicator = document.getElementById('thinking-indicator');

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(line => line.trim() !== '');

                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);

                        if (data.type === 'chunk' && data.content) {
                            if (thinkingIndicator && thinkingIndicator.parentNode) {
                                thinkingIndicator.remove();
                            }
                            if (!botMessageContent) {
                                botMessageContent = appendMessage('bot', '');
                            }
                            fullResponse += data.content;
                            botMessageContent.innerHTML = marked.parse(fullResponse, {
                                highlight: function (code, lang) {
                                    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                                    return hljs.highlight(code, { language }).value;
                                },
                                gfm: true,
                                tables: true
                            });
                            scrollToBottom();
                        } else if (data.type === 'end') {
                            if (!currentConversationId) {
                                currentConversationId = data.convo_id;
                                await loadConversationHistory();
                            }
                            if(botMessageContent) addCopyButtonsToCode(botMessageContent);
                        } else if (data.type === 'error') {
                            console.error("Backend error:", data.content);
                            appendMessage('bot', `Sorry, an error occurred: ${data.content}`);
                        }
                    } catch (e) {
                        console.error("Failed to parse stream line:", line, e);
                    }
                }
            }
        } catch (error) {
            console.error('Chat error:', error);
            const thinkingIndicator = document.getElementById('thinking-indicator');
            if (thinkingIndicator) thinkingIndicator.remove();
            appendMessage('bot', 'Sorry, a critical connection error occurred.');
        } finally {
            sendButton.disabled = false;
            messageInput.focus();
        }
    };
    
    // [NEW] Copies conversation to clipboard
    const copyConversation = () => {
        let conversationText = "";
        chatMessages.querySelectorAll('.message-wrapper').forEach(wrapper => {
            const sender = wrapper.classList.contains('user') ? 'User' : 'Bot';
            const text = wrapper.querySelector('.message-content').innerText;
            conversationText += `${sender}:\n${text}\n\n`;
        });

        if (conversationText) {
            navigator.clipboard.writeText(conversationText.trim()).then(() => {
                alert("Conversation copied to clipboard!");
            }, () => {
                alert("Failed to copy conversation.");
            });
        }
    };

    const autoResizeTextarea = () => { /* ... (no changes) ... */ };

    // --- Event Listeners ---
    loginForm.addEventListener('submit', handleLogin);
    chatForm.addEventListener('submit', handleSendMessage);
    logoutButton.addEventListener('click', () => {
        sessionStorage.removeItem('iTethrUser');
        window.location.reload();
    });
    newChatButton.addEventListener('click', startNewChat);
    copyConvoButton.addEventListener('click', copyConversation);
    messageInput.addEventListener('input', autoResizeTextarea);
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
        }
    });

    const storedUser = sessionStorage.getItem('iTethrUser');
    if (storedUser) {
        currentUser = JSON.parse(storedUser);
        loginScreen.classList.remove('active');
        chatScreen.classList.add('active');
        userInfo.textContent = `${currentUser.name}`;
        welcomeTitle.textContent = `Welcome, ${currentUser.name}!`;
        welcomeSubtitle.textContent = `iTethr Assistant, ready for your commands, ${currentUser.role}.`;
        loadConversationHistory();
    }
});