// File: web_ui/script.js
// [FIX] Made stream processing robust by adding error handling.
// [NOTE] Conversation history feature is not yet implemented.

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const loginSection = document.getElementById('login-section');
    const chatSection = document.getElementById('chat-section');
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const messageForm = document.getElementById('message-form');
    const messageInput = document.getElementById('message-input');
    const messagesContainer = document.getElementById('messages');
    const conversationList = document.getElementById('conversation-list');

    let currentConvoId = null; // Stores the ID of the current conversation

    // --- Event Listeners ---

    // Handle user login
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = usernameInput.value;
        const password = passwordInput.value;

        try {
            const response = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, password }),
            });

            if (response.ok) {
                const userData = await response.json();
                sessionStorage.setItem('user', JSON.stringify(userData));
                loginSection.style.display = 'none';
                chatSection.style.display = 'flex';
                // [NOTE] This function is empty. Conversation history is not implemented.
                loadConversations();
            } else {
                const errorData = await response.json();
                alert(`Login failed: ${errorData.detail}`);
            }
        } catch (error) {
            console.error('Login request failed:', error);
            alert('Could not connect to the server.');
        }
    });

    // Handle sending a message
    messageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const message = messageInput.value.trim();
        if (message) {
            displayMessage(message, 'user');
            sendMessageToServer(message);
            messageInput.value = '';
            messageInput.disabled = true;
        }
    });


    // --- Core Functions ---

    /**
     * Displays a message in the chat window.
     * @param {string} message - The message content.
     * @param {string} sender - 'user' or 'bot'.
     * @param {boolean} stream - If true, adds a spinner for streaming bot messages.
     * @returns {HTMLElement} - The created message element.
     */
    function displayMessage(message, sender, stream = false) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', `${sender}-message`);

        const contentElement = document.createElement('div');
        contentElement.classList.add('message-content');
        contentElement.textContent = message;
        messageElement.appendChild(contentElement);

        if (stream) {
            messageElement.classList.add('streaming');
            const spinner = document.createElement('div');
            spinner.classList.add('spinner');
            contentElement.textContent = ''; // Clear initial text for streaming
            contentElement.appendChild(spinner);
        }

        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        return messageElement;
    }


    /**
     * [FIXED] Processes a chunk of data from the server's streaming response.
     * @param {string} chunk - A string chunk from the stream.
     * @param {HTMLElement} element - The bot message element to append content to.
     */
    function processStreamChunk(chunk, element) {
        // A single chunk can have multiple complete/incomplete JSON objects.
        // We split by newline to handle each potential object.
        const lines = chunk.split('\n');

        lines.forEach(line => {
            if (line.trim()) {
                try {
                    // [FIX] This `try...catch` block prevents the app from crashing
                    // if it receives a malformed or incomplete JSON line.
                    const data = JSON.parse(line);
                    
                    if(data.type === 'chunk' && data.content) {
                        // Remove spinner on first chunk
                        const spinner = element.querySelector('.spinner');
                        if (spinner) spinner.remove();
                        // Append content as a text node to prevent XSS vulnerabilities
                        const textNode = document.createTextNode(data.content);
                        element.querySelector('.message-content').appendChild(textNode);
                    } else if (data.type === 'end') {
                        currentConvoId = data.convo_id; // Update to the final ID from server
                        element.classList.remove('streaming');
                        console.log(`Conversation complete. Final ID: ${currentConvoId}`);
                    } else if (data.type === 'error') {
                        element.classList.remove('streaming');
                        element.querySelector('.message-content').textContent = `Error: ${data.content}`;
                    }

                } catch (error) {
                    // Log the error but don't crash. Allows processing to continue.
                    console.warn('Could not parse stream line:', line, error);
                }
            }
        });
    }

    /**
     * Sends the user's message to the server and handles the streaming response.
     * @param {string} message - The message to send.
     */
    async function sendMessageToServer(message) {
        const user = JSON.parse(sessionStorage.getItem('user'));
        if (!user) {
            alert('You are not logged in!');
            return;
        }

        // Display a placeholder for the bot's response immediately.
        const botMessageElement = displayMessage('', 'bot', true);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: message,
                    username: user.username,
                    convo_id: currentConvoId,
                    user_info: { name: user.username, role: user.role }
                }),
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                const decodedChunk = decoder.decode(value, { stream: true });
                processStreamChunk(decodedChunk, botMessageElement);
            }

        } catch (error) {
            console.error('Failed to send message:', error);
            botMessageElement.querySelector('.message-content').textContent = 'Error: Could not get a response from the server.';
        } finally {
            botMessageElement.classList.remove('streaming');
            const spinner = botMessageElement.querySelector('.spinner');
            if(spinner) spinner.remove();
            messageInput.disabled = false;
            messageInput.focus();
        }
    }

    /**
     * [NOTE] This is a stub. To implement conversation history, this function
     * would need to fetch data from a backend endpoint and render it
     * into the #conversation-list element.
     */
    function loadConversations() {
        console.log("Conversation loading not yet implemented.");
        // Example of what would go here:
        // const user = JSON.parse(sessionStorage.getItem('user'));
        // const convos = await fetch(`/api/conversations/${user.username}`);
        // conversationList.innerHTML = ''; // Clear list
        // convos.forEach(convo => { /* create and append li elements */ });
    }
});