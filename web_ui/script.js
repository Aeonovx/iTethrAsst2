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

    // --- State Management ---
    let currentUser = null;

    // --- Functions ---

    /**
     * Scrolls the chat messages container to the bottom.
     */
    const scrollToBottom = () => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    };

    /**
     * Appends a message to the chat window.
     * @param {string} sender - 'user' or 'bot'.
     * @param {string} text - The message text.
     */
    const appendMessage = (sender, text) => {
        const messageWrapper = document.createElement('div');
        messageWrapper.className = `message-wrapper ${sender}`;

        const avatar = document.createElement('div');
        avatar.className = `avatar ${sender}-avatar`;
        avatar.textContent = sender === 'user' ? (currentUser?.name.charAt(0).toUpperCase() || 'U') : 'B';
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';

        if (sender === 'bot') {
            // Use marked.js to render Markdown for bot messages
            messageContent.innerHTML = marked.parse(text);
        } else {
            messageContent.textContent = text;
        }

        messageWrapper.appendChild(avatar);
        messageWrapper.appendChild(messageContent);
        chatMessages.appendChild(messageWrapper);
        
        scrollToBottom();
        return messageWrapper; // Return the wrapper to append suggestions to it
    };
    
    /**
     * Shows a typing indicator for the bot.
     */
    const showTypingIndicator = () => {
        const indicator = `
            <div class="message-wrapper bot" id="typing-indicator">
                <div class="avatar bot-avatar">B</div>
                <div class="message-content">
                    <div class="typing-indicator">
                        <span></span><span></span><span></span>
                    </div>
                </div>
            </div>
        `;
        chatMessages.insertAdjacentHTML('beforeend', indicator);
        scrollToBottom();
    };

    /**
     * Removes the typing indicator.
     */
    const hideTypingIndicator = () => {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) {
            indicator.remove();
        }
    };

    /**
     * Displays suggestions as clickable buttons below a bot message.
     * @param {Array<string>} suggestions - An array of suggestion strings.
     */
    const displaySuggestions = (suggestions) => {
        // Clear previous suggestions first
        const existingSuggestions = document.querySelector('.suggestions-container');
        if (existingSuggestions) {
            existingSuggestions.remove();
        }

        if (!suggestions || suggestions.length === 0) return;

        const suggestionsContainer = document.createElement('div');
        suggestionsContainer.className = 'suggestions-container';

        suggestions.forEach(suggestionText => {
            const button = document.createElement('button');
            button.className = 'suggestion-button';
            button.textContent = suggestionText;
            button.onclick = () => {
                messageInput.value = suggestionText;
                chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
            };
            suggestionsContainer.appendChild(button);
        });
        
        chatMessages.appendChild(suggestionsContainer);
        scrollToBottom();
    };


    /**
     * Handles the user login process.
     * @param {Event} e - The form submission event.
     */
    const handleLogin = async (e) => {
        e.preventDefault();
        loginError.textContent = '';
        const name = nameInput.value.trim();
        const password = passwordInput.value.trim();

        if (!name || !password) {
            loginError.textContent = 'Please enter both name and password.';
            return;
        }

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
                userInfo.textContent = `${currentUser.name} (${currentUser.role})`;
                appendMessage('bot', `Welcome, ${currentUser.name}! How can I assist you today?`);

            } else {
                loginError.textContent = 'Invalid name or password.';
            }
        } catch (error) {
            console.error('Login error:', error);
            loginError.textContent = 'An error occurred. Please try again.';
        }
    };

    /**
     * Handles sending a chat message.
     * @param {Event} e - The form submission event.
     */
    const handleSendMessage = async (e) => {
        e.preventDefault();
        const message = messageInput.value.trim();
        if (!message || !currentUser) return;

        appendMessage('user', message);
        messageInput.value = '';
        sendButton.disabled = true;

        // Clear previous suggestions immediately
        const existingSuggestions = document.querySelector('.suggestions-container');
        if (existingSuggestions) {
            existingSuggestions.remove();
        }
        
        showTypingIndicator();

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, username: currentUser.name }),
            });
            
            hideTypingIndicator();

            if (response.ok) {
                const data = await response.json();
                appendMessage('bot', data.response);
                displaySuggestions(data.suggestions);
            } else {
                appendMessage('bot', 'Sorry, I encountered an error. Please try again.');
            }
        } catch (error) {
            hideTypingIndicator();
            console.error('Chat error:', error);
            appendMessage('bot', 'Sorry, I couldn\'t connect to the server.');
        } finally {
            sendButton.disabled = false;
            messageInput.focus();
        }
    };

    /**
     * Handles user logout.
     */
    const handleLogout = () => {
        currentUser = null;
        sessionStorage.removeItem('iTethrUser');
        chatMessages.innerHTML = '';
        chatScreen.classList.remove('active');
        loginScreen.classList.add('active');
        nameInput.value = '';
        passwordInput.value = '';
    };
    
    /**
     * Checks for a logged-in user in session storage on page load.
     */
    const checkSession = () => {
        const storedUser = sessionStorage.getItem('iTethrUser');
        if (storedUser) {
            currentUser = JSON.parse(storedUser);
            loginScreen.classList.remove('active');
            chatScreen.classList.add('active');
            userInfo.textContent = `${currentUser.name} (${currentUser.role})`;
            appendMessage('bot', `Welcome back, ${currentUser.name}! Let's continue.`);
        }
    };

    // --- Event Listeners ---
    loginForm.addEventListener('submit', handleLogin);
    chatForm.addEventListener('submit', handleSendMessage);
    logoutButton.addEventListener('click', handleLogout);
    
    // Check for existing session on load
    checkSession();
});
