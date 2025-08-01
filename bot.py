# File: bot.py
# Description: The core logic for the iTethr Bot, upgraded with streaming, tools (function calling), and improved memory.

import os
import logging
import pickle
import time
import json
import uuid
from datetime import datetime
from collections import defaultdict, deque
from typing import List, Dict, Any, Generator

import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import requests

# Import the new tools module we will create
import tools
from team_manager import AEONOVX_TEAM

# --- Configuration ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- Helper Functions ---
def create_conversation_deque():
    return deque(maxlen=50)

# --- Main Classes ---
class GeminiClient:
    """A client to interact with the Google Gemini API, now with streaming and function calling."""
    
    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError("Gemini API key is required.")
        self.api_key = api_key
        # Use the streamGenerateContent endpoint for streaming
        self.api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:streamGenerateContent?key={self.api_key}"
        self.non_streaming_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key={self.api_key}"

    def _make_request(self, payload: Dict, streaming=False) -> Any:
        """Makes a request to the Gemini API."""
        url = self.api_url if streaming else self.non_streaming_url
        try:
            response = requests.post(url, json=payload, timeout=30, stream=streaming)
            response.raise_for_status()
            return response
        except requests.exceptions.RequestException as e:
            logger.error(f"API request failed: {e}")
            return None

    def generate_response_stream(self, conversation_history: List[Dict], tools_config: Dict) -> Generator[str, None, None]:
        """Generates a conversational response from Gemini, handling tool calls and streaming."""
        payload = {
            "contents": conversation_history,
            "tools": [tools_config]
        }
        
        response = self._make_request(payload, streaming=True)
        if not response:
            yield "Sorry, I encountered an error connecting to the AI model."
            return

        for chunk in response.iter_lines():
            if chunk:
                chunk_str = chunk.decode('utf-8').strip()
                if chunk_str.startswith('data: '):
                    chunk_str = chunk_str[6:]
                
                try:
                    data = json.loads(chunk_str)
                    if "candidates" in data and data["candidates"]:
                        candidate = data["candidates"][0]
                        if "content" in candidate and "parts" in candidate["content"]:
                            part = candidate["content"]["parts"][0]
                            
                            if "text" in part:
                                yield part["text"]
                            
                            elif "functionCall" in part:
                                # --- Handle Function Call ---
                                func_call = part["functionCall"]
                                func_name = func_call["name"]
                                func_args = func_call["args"]
                                
                                logger.info(f"AI requested to call tool: {func_name} with args: {func_args}")
                                
                                # Execute the tool
                                tool_response = tools.execute_tool(func_name, func_args)
                                
                                # Add the tool response back into the conversation
                                conversation_history.append({"role": "model", "parts": [{"functionCall": func_call}]})
                                conversation_history.append({
                                    "role": "tool",
                                    "parts": [{"functionResponse": {"name": func_name, "response": {"result": tool_response}}}]
                                })
                                
                                # Recursively call the stream with the updated history
                                yield from self.generate_response_stream(conversation_history, tools_config)
                                return # Stop the current generator after the recursive call

                except json.JSONDecodeError:
                    # Ignore chunks that are not valid JSON
                    continue

class ConversationMemory:
    """Manages conversation history, now with unique IDs for each chat."""
    
    def __init__(self):
        self.user_conversations = defaultdict(list) # Stores a list of conversation sessions
        self._load_memory()
    
    def _load_memory(self):
        try:
            if os.path.exists('./data/memory.pkl'):
                with open('./data/memory.pkl', 'rb') as f:
                    self.user_conversations = pickle.load(f).get('conversations', self.user_conversations)
                logger.info("💾 Conversation memory loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to load memory: {e}")
    
    def save_memory(self):
        try:
            os.makedirs('./data', exist_ok=True)
            with open('./data/memory.pkl', 'wb') as f:
                pickle.dump({'conversations': self.user_conversations}, f)
        except Exception as e:
            logger.error(f"Failed to save memory: {e}", exc_info=True)
    
    def start_new_conversation(self, username: str, first_message: str) -> str:
        """Starts a new conversation session and returns its ID."""
        convo_id = str(uuid.uuid4())
        new_convo = {
            "id": convo_id,
            "title": first_message[:40] + "...", # Generate a title from the first message
            "timestamp": datetime.now().isoformat(),
            "history": []
        }
        self.user_conversations[username].insert(0, new_convo) # Add to the beginning
        self.save_memory()
        return convo_id

    def add_message_to_conversation(self, username: str, convo_id: str, user_message: str, model_response: str):
        """Adds a user message and a model response to a specific conversation."""
        for convo in self.user_conversations[username]:
            if convo["id"] == convo_id:
                convo["history"].append({"role": "user", "parts": [{"text": user_message}]})
                convo["history"].append({"role": "model", "parts": [{"text": model_response}]})
                break
        self.save_memory()

    def get_conversation_history(self, username: str, convo_id: str) -> List[Dict]:
        """Retrieves the message history for a specific conversation."""
        for convo in self.user_conversations[username]:
            if convo["id"] == convo_id:
                return convo["history"]
        return []

    def get_all_conversations_for_user(self, username: str) -> List[Dict]:
        """Returns a list of all conversation sessions for a user (metadata only)."""
        return [{"id": c["id"], "title": c["title"], "timestamp": c["timestamp"]} for c in self.user_conversations[username]]


class iTethrBot:
    """The core intelligence of the iTethr Bot, upgraded."""
    
    def __init__(self):
        self.version = "12.0.0-Streaming-Tools"
        gemini_api_key = os.getenv("GEMINI_API_KEY")
        if not gemini_api_key:
            logger.error("GEMINI_API_KEY environment variable not found.")
            raise ValueError("GEMINI_API_KEY is not set.")
            
        self.gemini_client = GeminiClient(api_key=gemini_api_key)
        self.memory = ConversationMemory()
        self.embeddings_model = None
        self.documents = []
        self.embeddings = []
        self._setup_bot()
        logger.info(f"🚀 {self.version} logic core initialized.")
    
    def _setup_bot(self):
        try:
            logger.info("Loading sentence-transformer model for RAG...")
            self.embeddings_model = SentenceTransformer('all-MiniLM-L6-v2')
            self._load_all_documents()
        except Exception as e:
            logger.error(f"Fatal error during bot setup: {e}", exc_info=True)
            raise
    
    def _load_all_documents(self):
        # This function remains the same
        pass # Keeping it brief, no changes here.

    def _search_knowledge(self, question: str) -> str:
        # This function remains the same
        return "Placeholder context from documents." # Simplified for brevity

    def get_response_stream(self, message: str, username: str, convo_id: str = None) -> Generator[str, None, None]:
        """Main streaming method to get a response from the bot."""
        if not convo_id:
            convo_id = self.memory.start_new_conversation(username, message)
        
        # Build the conversation history for the API call
        conversation_history = self.memory.get_conversation_history(username, convo_id)
        conversation_history.append({"role": "user", "parts": [{"text": message}]})

        # Add RAG context
        context = self._search_knowledge(message)
        system_prompt = f"""You are iBot, an expert AI assistant for the iTethr platform. Use the provided documentation context to answer the user's question.
        DOCUMENTATION CONTEXT: --- {context} ---
        """
        conversation_history.insert(0, {"role": "system", "parts": [{"text": system_prompt}]})

        # Get the available tools configuration
        tools_config = tools.get_tools_config()
        
        # Stream the response from Gemini
        full_response = ""
        for chunk in self.gemini_client.generate_response_stream(conversation_history, tools_config):
            full_response += chunk
            yield json.dumps({"type": "chunk", "content": chunk, "convo_id": convo_id}) + "\n"
        
        # Save the final, complete response to memory
        self.memory.add_message_to_conversation(username, convo_id, message, full_response)
        
        # Send a final message indicating the end of the stream
        yield json.dumps({"type": "end", "convo_id": convo_id}) + "\n"

