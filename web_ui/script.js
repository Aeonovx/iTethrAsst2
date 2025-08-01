// File: web_ui/script.js

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
    const newChatButton = document.getElementById('new-chat-button');
    const welcomeMessage = document.getElementById('welcome-message');

    // --- State Management ---
    let currentUser = null;
    let currentConversationId = null;

    // --- Functions ---

    /**
     * Scrolls the chat messages container to the bottom.
     */
    const scrollToBottom = () => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    };

    /**
     * Adds copy buttons to all <pre> blocks in a message.
     * @param {HTMLElement} messageElement - The message element containing the code.
     */
    const addCopyButtons = (messageElement) => {
        const preBlocks = messageElement.querySelectorAll('pre');
        preBlocks.forEach(pre => {
            const code = pre.querySelector('code');
            if (code) {
                const button = document.createElement('button');
                button.className = 'copy-code-button';
                button.textContent = 'Copy';
                button.onclick = () => {
                    navigator.clipboard.writeText(code.innerText).then(() => {
                        button.textContent = 'Copied!';
                        setTimeout(() => { button.textContent = 'Copy'; }, 2000);
                    });
                };
                pre.appendChild(button);
            }
        });
    };

    /**
     * Appends a message to the chat window.
     * @param {string} sender - 'user' or 'bot'.
     * @param {string} text - The message text.
     * @returns {HTMLElement} The created message element.
     */
    const appendMessage = (sender, text) => {
        welcomeMessage.style.display = 'none';
        chatMessages.style.display = 'flex';

        const messageWrapper = document.createElement('div');
        messageWrapper.className = `message-wrapper ${sender}`;

        const avatar = document.createElement('div');
        avatar.className = `avatar ${sender}-avatar`;
        avatar.textContent = sender === 'user' ? (currentUser?.name.charAt(0).toUpperCase() || 'U') : 'B';
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        messageContent.innerHTML = marked.parse(text);

        messageWrapper.appendChild(avatar);
        messageWrapper.appendChild(messageContent);
        chatMessages.appendChild(messageWrapper);
        
        scrollToBottom();
        return messageContent;
    };

    /**
     * Fetches and displays the conversation history in the sidebar.
     */
    const loadConversationHistory = async () => {
        if (!currentUser) return;
        try {
            const response = await fetch(`/api/conversations/${currentUser.name}`);
            if (response.ok) {
                const history = await response.json();
                conversationHistory.innerHTML = '';
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

    /**
     * Loads a specific conversation into the chat window.
     * @param {string} convoId - The ID of the conversation to load.
     */
    const loadConversation = async (convoId) => {
        try {
            const response = await fetch(`/api/conversation/${currentUser.name}/${convoId}`);
            if (response.ok) {
                const history = await response.json();
                chatMessages.innerHTML = '';
                history.forEach(message => {
                    const messageEl = appendMessage(message.role === 'user' ? 'user' : 'bot', message.parts[0].text);
                    addCopyButtons(messageEl);
                });
                currentConversationId = convoId;
                document.querySelectorAll('.conversation-item').forEach(el => {
                    el.classList.toggle('active', el.dataset.id === convoId);
                });
            }
        } catch (error) {
            console.error("Failed to load conversation:", error);
        }
    };

    /**
     * Starts a new chat session.
     */
    const startNewChat = () => {
        currentConversationId = null;
        chatMessages.innerHTML = '';
        chatMessages.style.display = 'none';
        welcomeMessage.style.display = 'flex';
        messageInput.value = '';
        document.querySelectorAll('.conversation-item.active').forEach(el => el.classList.remove('active'));
    };

    /**
     * Handles the user login process.
     */
    const handleLogin = async (e) => {
        e.preventDefault();
        // ... (Login logic remains the same)
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
                await loadConversationHistory();
                startNewChat();
            } else {
                loginError.textContent = 'Invalid name or password.';
            }
        } catch (error) {
            loginError.textContent = 'An error occurred.';
        }
    };
    
    /**
     * Handles sending a chat message and processing the stream.
     */
    const handleSendMessage = async (e) => {
        e.preventDefault();
        const message = messageInput.value.trim();
        if (!message || !currentUser) return;

        appendMessage('user', message);
        messageInput.value = '';
        autoResizeTextarea();
        sendButton.disabled = true;

        let botMessageContent;
        let fullResponse = "";

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, username: currentUser.name, convo_id: currentConversationId }),
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n').filter(line => line.trim() !== '');

                for (const line of lines) {
                    const data = JSON.parse(line);

                    if (data.type === 'chunk') {
                        if (!botMessageContent) {
                            // First chunk, create the message element
                            botMessageContent = appendMessage('bot', '');
                        }
                        fullResponse += data.content;
                        botMessageContent.innerHTML = marked.parse(fullResponse);
                        scrollToBottom();
                    } else if (data.type === 'end') {
                        if (!currentConversationId) {
                            // This was a new chat, update history
                            currentConversationId = data.convo_id;
                            await loadConversationHistory();
                        }
                        addCopyButtons(botMessageContent);
                    }
                }
            }
        } catch (error) {
            console.error('Chat error:', error);
            if (botMessageContent) {
                botMessageContent.innerHTML += "<p><em>Sorry, an error occurred.</em></p>";
            } else {
                appendMessage('bot', 'Sorry, an error occurred.');
            }
        } finally {
            sendButton.disabled = false;
            messageInput.focus();
        }
    };
    
    /**
     * Auto-resizes the textarea height based on content.
     */
    const autoResizeTextarea = () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = (messageInput.scrollHeight) + 'px';
    };

    // --- Event Listeners and Initializers ---
    loginForm.addEventListener('submit', handleLogin);
    chatForm.addEventListener('submit', handleSendMessage);
    logoutButton.addEventListener('click', () => {
        sessionStorage.removeItem('iTethrUser');
        window.location.reload();
    });
    newChatButton.addEventListener('click', startNewChat);
    messageInput.addEventListener('input', autoResizeTextarea);
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
        }
    });

    // Check for existing session on page load
    const storedUser = sessionStorage.getItem('iTethrUser');
    if (storedUser) {
        currentUser = JSON.parse(storedUser);
        loginScreen.classList.remove('active');
        chatScreen.classList.add('active');
        userInfo.textContent = `${currentUser.name}`;
        loadConversationHistory();
    }
});
