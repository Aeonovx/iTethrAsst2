// File: script.js
// Description: Final, stable version of the frontend logic.
// [FIX] Corrects mobile UI, personalization, and conversation history.

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const loginScreen = document.getElementById('login-screen');
    const chatScreen = document.getElementById('chat-screen');
    const loginForm = document.getElementById('login-form');
    // ... (rest of element definitions are the same) ...
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
    const menuToggle = document.getElementById('menu-toggle'); // Mobile menu button

    // --- State Management ---
    let currentUser = null;
    let currentConversationId = null;

    // --- [FIX] Mobile Sidebar Logic ---
    menuToggle.addEventListener('click', () => {
        document.body.classList.toggle('sidebar-open');
    });

    chatMessages.addEventListener('click', () => {
        if (document.body.classList.contains('sidebar-open')) {
            document.body.classList.remove('sidebar-open');
        }
    });

    // --- Theme Management ---
    // ... (no changes to theme logic) ...
    const applyTheme = (theme) => { document.body.classList.remove('light-theme', 'dark-theme'); document.body.classList.add(theme); themeToggle.checked = theme === 'dark-theme'; };
    themeToggle.addEventListener('change', () => { const newTheme = themeToggle.checked ? 'dark-theme' : 'light-theme'; localStorage.setItem('iTethrTheme', newTheme); applyTheme(newTheme); });
    const savedTheme = localStorage.getItem('iTethrTheme') || 'dark-theme';
    applyTheme(savedTheme);

    // --- Core Functions ---
    const scrollToBottom = () => { chatMessages.scrollTop = chatMessages.scrollHeight; };
    const autoResizeTextarea = () => { messageInput.style.height = 'auto'; messageInput.style.height = (messageInput.scrollHeight) + 'px'; };

    const addCopyButtonsToCode = (messageElement) => { /* ... (no changes) ... */ };

    const appendMessage = (sender, text) => {
        // ... (this function is now stable, no changes) ...
        if (welcomeMessage) welcomeMessage.style.display = 'none';
        chatMessages.style.display = 'flex';
        const messageWrapper = document.createElement('div');
        messageWrapper.className = `message-wrapper ${sender}`;
        const avatar = document.createElement('div');
        avatar.className = `avatar ${sender}-avatar`;
        avatar.textContent = sender === 'user' ? (currentUser?.name.charAt(0).toUpperCase() || 'U') : 'B';
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        const parsedHtml = marked.parse(text, { highlight: function (code, lang) { const language = hljs.getLanguage(lang) ? lang : 'plaintext'; return hljs.highlight(code, { language }).value; }, gfm: true, tables: true });
        messageContent.innerHTML = parsedHtml;
        messageWrapper.appendChild(avatar);
        messageWrapper.appendChild(messageContent);
        chatMessages.appendChild(messageWrapper);
        scrollToBottom();
        addCopyButtonsToCode(messageContent);
        return messageContent;
    };
    
    const showThinkingIndicator = () => { /* ... (no changes) ... */ };
    
    // [FIX] Correctly loads and displays conversation history
    const loadConversationHistory = async () => {
        if (!currentUser) return;
        try {
            const response = await fetch(`/api/conversations/${currentUser.name}`);
            if (response.ok) {
                const history = await response.json();
                conversationHistory.innerHTML = ''; // Clear previous history
                history.forEach(convo => {
                    const item = document.createElement('div');
                    item.className = 'conversation-item';
                    item.textContent = convo.title;
                    item.dataset.id = convo.id;
                    if (convo.id === currentConversationId) {
                        item.classList.add('active');
                    }
                    item.onclick = () => loadConversation(convo.id);
                    conversationHistory.appendChild(item);
                });
            }
        } catch (error) {
            console.error("Failed to load conversation history:", error);
        }
    };

    // [FIX] Correctly loads a single conversation
    const loadConversation = async (convoId) => {
        if (!currentUser || convoId === currentConversationId) return;
        try {
            const response = await fetch(`/api/conversation/${currentUser.name}/${convoId}`);
            if (response.ok) {
                const history = await response.json();
                chatMessages.innerHTML = '';
                history.forEach(message => {
                    const role = message.role === 'user' ? 'user' : 'bot';
                    const content = message.content || (message.tool_calls ? "Thinking about a tool..." : "...");
                    if (message.role !== 'tool') { // Don't display tool messages
                         appendMessage(role, content);
                    }
                });
                currentConversationId = convoId;
                document.querySelectorAll('.conversation-item').forEach(el => {
                    el.classList.toggle('active', el.dataset.id === convoId);
                });
                document.body.classList.remove('sidebar-open');
            }
        } catch (error) {
            console.error("Failed to load conversation:", error);
        }
    };

    const startNewChat = () => { /* ... (confirmation logic is stable, no changes) ... */ };

    // [FIX] Correctly displays user's name AND profession
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
                welcomeSubtitle.textContent = `iTethr Assistant, ready for your commands, ${currentUser.role}.`; // Fixed to show role

                await loadConversationHistory();
                startNewChat();
            } else {
                loginError.textContent = 'Invalid name or password.';
            }
        } catch (error) {
            loginError.textContent = 'An error occurred during login.';
        }
    };
    
    // [FIX] Passes user info correctly in the chat request
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
                body: JSON.stringify({
                    message: message,
                    username: currentUser.name,
                    user_info: currentUser, // Pass the whole user object
                    convo_id: currentConversationId
                }),
            });
            // ... (rest of streaming logic is stable, no changes) ...
        } catch (error) {
            // ...
        } finally {
            sendButton.disabled = false;
            messageInput.focus();
        }
    };
    
    const copyConversation = () => { /* ... (no changes) ... */ };

    // --- Event Listeners and Initializers ---
    // ... (no changes) ...
});