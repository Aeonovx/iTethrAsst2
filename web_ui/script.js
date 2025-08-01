// File: script.js
// Description: Final, stable version of the frontend logic.
// [CRITICAL FIX] Rewrote response streaming to display messages in real-time.
// [FEATURE] Added a "thinking" indicator animation.
// [FIX] Ensured the "New Chat" button works correctly.

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const loginScreen = document.getElementById('login-screen');
    const chatScreen = document.getElementById('chat-screen');
    const loginForm = document.getElementById('login-form');
    const nameInput = document.getElementById('name');
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('login-error');
    const loginButton = loginForm.querySelector('button');
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
    const menuToggle = document.getElementById('menu-toggle');

    // --- State Management ---
    let currentUser = null;
    let currentConversationId = null;

    // --- Mobile Sidebar Logic ---
    menuToggle.addEventListener('click', () => {
        document.body.classList.toggle('sidebar-open');
    });
    chatMessages.addEventListener('click', () => {
        if (document.body.classList.contains('sidebar-open')) {
            document.body.classList.remove('sidebar-open');
        }
    });

    // --- Theme Management ---
    const applyTheme = (theme) => { document.body.classList.remove('light-theme', 'dark-theme'); document.body.classList.add(theme); themeToggle.checked = theme === 'dark-theme'; };
    themeToggle.addEventListener('change', () => { const newTheme = themeToggle.checked ? 'dark-theme' : 'light-theme'; localStorage.setItem('iTethrTheme', newTheme); applyTheme(newTheme); });
    const savedTheme = localStorage.getItem('iTethrTheme') || 'dark-theme';
    applyTheme(savedTheme);

    // --- Core Functions ---
    const scrollToBottom = () => { chatMessages.scrollTop = chatMessages.scrollHeight; };
    const autoResizeTextarea = () => { messageInput.style.height = 'auto'; messageInput.style.height = (messageInput.scrollHeight) + 'px'; };

    const addCopyButtonsToCode = (container) => {
        const codeBlocks = container.querySelectorAll('pre > code');
        codeBlocks.forEach(codeBlock => {
            const pre = codeBlock.parentElement;
            if (pre.querySelector('.copy-button')) return;

            const copyButton = document.createElement('button');
            copyButton.className = 'copy-button';
            copyButton.innerHTML = '<i class="fas fa-copy"></i>';
            copyButton.addEventListener('click', () => {
                navigator.clipboard.writeText(codeBlock.innerText).then(() => {
                    copyButton.innerHTML = '<i class="fas fa-check"></i>';
                    setTimeout(() => { copyButton.innerHTML = '<i class="fas fa-copy"></i>'; }, 2000);
                });
            });
            pre.style.position = 'relative';
            pre.appendChild(copyButton);
        });
    };

    const appendMessage = (sender, text = '') => {
        if (welcomeMessage.style.display !== 'none') {
            welcomeMessage.style.display = 'none';
            chatMessages.style.display = 'flex';
        }

        const messageWrapper = document.createElement('div');
        messageWrapper.className = `message-wrapper ${sender}`;

        const avatar = document.createElement('div');
        avatar.className = `avatar ${sender}-avatar`;
        avatar.textContent = sender === 'user' ? (currentUser?.name.charAt(0).toUpperCase() || 'U') : 'B';

        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';

        if (text) {
             messageContent.innerHTML = marked.parse(text, { gfm: true, breaks: true, highlight: (code, lang) => { const language = hljs.getLanguage(lang) ? lang : 'plaintext'; return hljs.highlight(code, { language }).value; }});
        }

        messageWrapper.appendChild(avatar);
        messageWrapper.appendChild(messageContent);
        chatMessages.appendChild(messageWrapper);
        scrollToBottom();

        return messageContent;
    };

    // [IMPROVEMENT] Thinking indicator logic
    const showThinkingIndicator = () => {
        let indicatorWrapper = document.getElementById('thinking-indicator');
        if (!indicatorWrapper) {
            indicatorWrapper = document.createElement('div');
            indicatorWrapper.id = 'thinking-indicator';
            indicatorWrapper.className = 'message-wrapper bot';

            const avatar = document.createElement('div');
            avatar.className = 'avatar bot-avatar';
            avatar.textContent = 'B';

            const messageContent = document.createElement('div');
            messageContent.className = 'message-content';
            messageContent.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';

            indicatorWrapper.appendChild(avatar);
            indicatorWrapper.appendChild(messageContent);
            chatMessages.appendChild(indicatorWrapper);
        }
        indicatorWrapper.style.display = 'flex';
        scrollToBottom();
    };

    const removeThinkingIndicator = () => {
        const indicator = document.getElementById('thinking-indicator');
        if (indicator) {
            indicator.remove();
        }
    };

    const loadConversationHistory = async () => {
        // ... (no changes in this function)
    };

    const loadConversation = async (convoId) => {
        // ... (no changes in this function)
    };

    // [FIX] Correctly resets the chat state for a new conversation.
    const startNewChat = () => {
        currentConversationId = null;
        chatMessages.innerHTML = '';
        welcomeMessage.style.display = 'flex';
        chatMessages.style.display = 'none';
        messageInput.value = '';
        autoResizeTextarea();
        document.querySelectorAll('.conversation-item').forEach(el => el.classList.remove('active'));
        document.body.classList.remove('sidebar-open');
    };

    const handleLogin = async (e) => {
        // ... (no changes in this function)
    };

    // [CRITICAL FIX] Complete rewrite of the message sending and streaming logic.
    const handleSendMessage = async (e) => {
        if (e) e.preventDefault();
        const message = messageInput.value.trim();
        if (!message || !currentUser) return;

        appendMessage('user', message);
        messageInput.value = '';
        autoResizeTextarea();
        sendButton.disabled = true;

        showThinkingIndicator();

        let botMessageElement = null;
        let fullResponse = "";

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: message,
                    username: currentUser.name,
                    user_info: currentUser,
                    convo_id: currentConversationId
                }),
            });

            if (!response.body) {
                throw new Error("Response body is missing.");
            }

            // Process the stream
            const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
            while (true) {
                const { value, done } = await reader.read();
                if (done) {
                    break;
                }

                const lines = value.split('\n').filter(line => line.trim());
                for (const line of lines) {
                    try {
                        const chunkData = JSON.parse(line);

                        // If it's the first chunk, remove "thinking" and create the message element
                        if (chunkData.type === 'chunk' && !botMessageElement) {
                            removeThinkingIndicator();
                            botMessageElement = appendMessage('bot');
                        }

                        if (chunkData.type === 'chunk') {
                            fullResponse += chunkData.content;
                            botMessageElement.innerHTML = marked.parse(fullResponse + '▌', { gfm: true, breaks: true, highlight: (code, lang) => { const language = hljs.getLanguage(lang) ? lang : 'plaintext'; return hljs.highlight(code, { language }).value; }});
                        } else if (chunkData.type === 'end') {
                            if (!currentConversationId) {
                                currentConversationId = chunkData.convo_id;
                                loadConversationHistory(); // Refresh history to show the new convo
                            }
                        } else if (chunkData.type === 'error') {
                            throw new Error(chunkData.content);
                        }
                    } catch (jsonError) {
                        console.error("Failed to parse stream chunk:", line, jsonError);
                    }
                }
                scrollToBottom();
            }

            if (botMessageElement) {
                // Final render without the cursor
                botMessageElement.innerHTML = marked.parse(fullResponse, { gfm: true, breaks: true, highlight: (code, lang) => { const language = hljs.getLanguage(lang) ? lang : 'plaintext'; return hljs.highlight(code, { language }).value; }});
                addCopyButtonsToCode(botMessageElement);
            }

        } catch (error) {
            removeThinkingIndicator();
            appendMessage('bot', `Sorry, an error occurred: ${error.message}`);
            console.error("Error sending message:", error);
        } finally {
            sendButton.disabled = false;
            messageInput.focus();
        }
    };

    const copyConversation = () => { /* ... (no changes) ... */ };

    // --- Event Listeners and Initializers ---
    loginForm.addEventListener('submit', handleLogin);
    chatForm.addEventListener('submit', handleSendMessage);
    messageInput.addEventListener('input', autoResizeTextarea);
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage(e);
        }
    });
    logoutButton.addEventListener('click', () => {
        sessionStorage.removeItem('iTethrUser');
        window.location.reload();
    });
    newChatButton.addEventListener('click', startNewChat);
    copyConvoButton.addEventListener('click', copyConversation);

    // Check for saved user session
    const savedUser = sessionStorage.getItem('iTethrUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        loginScreen.classList.remove('active');
        chatScreen.classList.add('active');
        userInfo.textContent = `${currentUser.name}`;
        welcomeTitle.textContent = `Welcome back, ${currentUser.name}!`;
        welcomeSubtitle.textContent = `iTethr Assistant, ready for your commands, ${currentUser.role}.`;
        loadConversationHistory();
        startNewChat();
    } else {
        loginScreen.classList.add('active');
    }
});