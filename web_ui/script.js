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
    const welcomeMessage = document.getElementById('welcome-message');

    // --- State Management ---
    let currentUser = null;
    let currentConversationId = null;

    // --- Functions ---

    const scrollToBottom = () => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    };

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

    const showThinkingIndicator = () => {
        welcomeMessage.style.display = 'none';
        chatMessages.style.display = 'flex';

        const indicatorWrapper = document.createElement('div');
        indicatorWrapper.className = 'message-wrapper bot';
        indicatorWrapper.id = 'thinking-indicator';

        const avatar = document.createElement('div');
        avatar.className = 'avatar bot-avatar';
        avatar.textContent = 'B';

        const indicatorContent = document.createElement('div');
        indicatorContent.className = 'thinking-indicator';
        indicatorContent.innerHTML = '<span></span><span></span><span></span>';

        indicatorWrapper.appendChild(avatar);
        indicatorWrapper.appendChild(indicatorContent);
        chatMessages.appendChild(indicatorWrapper);
        scrollToBottom();
    };

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

    const startNewChat = () => {
        currentConversationId = null;
        chatMessages.innerHTML = '';
        chatMessages.style.display = 'none';
        welcomeMessage.style.display = 'flex';
        messageInput.value = '';
        document.querySelectorAll('.conversation-item.active').forEach(el => el.classList.remove('active'));
    };

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
                await loadConversationHistory();
                startNewChat();
            } else {
                loginError.textContent = 'Invalid name or password.';
            }
        } catch (error) {
            loginError.textContent = 'An error occurred.';
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

            // [FIX] Check if the HTTP response itself is an error
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            const thinkingIndicator = document.getElementById('thinking-indicator');

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                if (thinkingIndicator && !botMessageContent) {
                    thinkingIndicator.remove();
                }

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n').filter(line => line.trim() !== '');

                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);

                        if (data.type === 'chunk') {
                            if (!botMessageContent) {
                                botMessageContent = appendMessage('bot', '');
                            }
                            fullResponse += data.content;
                            botMessageContent.innerHTML = marked.parse(fullResponse);
                            scrollToBottom();
                        } else if (data.type === 'end') {
                            if (!currentConversationId) {
                                currentConversationId = data.convo_id;
                                await loadConversationHistory();
                            }
                            if(botMessageContent) addCopyButtons(botMessageContent);
                        // [FIX] Handle specific error messages streamed from the backend
                        } else if (data.type === 'error') {
                            console.error("Backend error:", data.content);
                            if (botMessageContent) {
                                botMessageContent.innerHTML += `<p><em><br>Error: ${data.content}</em></p>`;
                            } else {
                                appendMessage('bot', `Sorry, the bot encountered an error: ${data.content}`);
                            }
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
            
            if (botMessageContent) {
                botMessageContent.innerHTML += "<p><em>Sorry, a connection error occurred.</em></p>";
            } else {
                appendMessage('bot', 'Sorry, an error occurred.');
            }
        } finally {
            sendButton.disabled = false;
            messageInput.focus();
        }
    };
    
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

    const storedUser = sessionStorage.getItem('iTethrUser');
    if (storedUser) {
        currentUser = JSON.parse(storedUser);
        loginScreen.classList.remove('active');
        chatScreen.classList.add('active');
        userInfo.textContent = `${currentUser.name}`;
        loadConversationHistory();
    }
});