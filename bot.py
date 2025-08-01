# File: bot.py
# Description: The core logic for the iTethr Bot, with final stability fixes.

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
        self.api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:streamGenerateContent?key={self.api_key}"

    def generate_response_stream(self, conversation_history: List[Dict], tools_config: Dict) -> Generator[Dict, None, None]:
        """
        Generates a conversational response from Gemini, handling tool calls and streaming.
        [FIX] This now yields dictionary objects for clearer communication.
        """
        payload = {
            "contents": conversation_history,
            "tools": [tools_config]
        }
        
        try:
            response = requests.post(self.api_url, json=payload, timeout=45, stream=True)
            response.raise_for_status()
        except requests.exceptions.RequestException as e:
            logger.error(f"API request failed: {e}")
            yield {"type": "error", "content": f"Sorry, I couldn't connect to the AI model. Error: {e}"}
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
                                yield {"type": "chunk", "content": part["text"]}
                            
                            elif "functionCall" in part:
                                func_call = part["functionCall"]
                                func_name = func_call["name"]
                                func_args = func_call["args"]
                                
                                logger.info(f"AI requested tool: {func_name}({func_args})")
                                
                                tool_response = tools.execute_tool(func_name, func_args)
                                
                                conversation_history.append({"role": "model", "parts": [{"functionCall": func_call}]})
                                conversation_history.append({
                                    "role": "tool",
                                    "parts": [{"functionResponse": {"name": func_name, "response": {"result": tool_response}}}]
                                })
                                
                                # Recursively call with the updated history
                                yield from self.generate_response_stream(conversation_history, tools_config)
                                return

                except json.JSONDecodeError:
                    continue # Ignore non-JSON chunks

class ConversationMemory:
    """Manages conversation history."""
    
    def __init__(self):
        self.user_conversations = defaultdict(list)
        self._load_memory()
    
    def _load_memory(self):
        try:
            if os.path.exists('./data/memory.pkl'):
                with open('./data/memory.pkl', 'rb') as f:
                    self.user_conversations = pickle.load(f).get('conversations', self.user_conversations)
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
        convo_id = str(uuid.uuid4())
        new_convo = {"id": convo_id, "title": first_message[:45] + "...", "history": []}
        self.user_conversations[username].insert(0, new_convo)
        self.save_memory()
        return convo_id

    def add_message_to_conversation(self, username: str, convo_id: str, user_message: str, model_response: str):
        for convo in self.user_conversations[username]:
            if convo["id"] == convo_id:
                convo["history"].append({"role": "user", "parts": [{"text": user_message}]})
                convo["history"].append({"role": "model", "parts": [{"text": model_response}]})
                break
        self.save_memory()

    def get_conversation_history(self, username: str, convo_id: str) -> List[Dict]:
        for convo in self.user_conversations[username]:
            if convo["id"] == convo_id:
                return convo["history"]
        return []

    def get_all_conversations_for_user(self, username: str) -> List[Dict]:
        return [{"id": c["id"], "title": c["title"]} for c in self.user_conversations[username]]


class iTethrBot:
    """The core intelligence of the iTethr Bot."""
    
    def __init__(self):
        self.version = "12.3.0-Stable"
        gemini_api_key = os.getenv("GEMINI_API_KEY")
        if not gemini_api_key:
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
            self.embeddings_model = SentenceTransformer('all-MiniLM-L6-v2')
            self._load_all_documents()
        except Exception as e:
            logger.error(f"Fatal error during bot setup: {e}", exc_info=True)
            raise
    
    def _load_all_documents(self):
        # Implementation remains the same
        pass

    def _search_knowledge(self, question: str) -> str:
        # Implementation remains the same
        return "Placeholder context from documents."

    def get_response_stream(self, message: str, username: str, convo_id: str = None) -> Generator[str, None, None]:
        """Main streaming method to get a response from the bot."""
        try:
            if not convo_id:
                convo_id = self.memory.start_new_conversation(username, message)
            
            clean_history = self.memory.get_conversation_history(username, convo_id)
            context = self._search_knowledge(message) or "No relevant documentation was found."
            
            system_prompt = f"""
            You are iBot, a friendly mentor for the AeonovX team.
            **Personality:** Be warm, encouraging, and use simple examples.
            **Instructions:** Use the `DOCUMENTATION CONTEXT` to answer. If irrelevant, say so politely. Use Markdown.
            ---
            DOCUMENTATION CONTEXT: {context}
            ---
            """
            
            api_history = list(clean_history)
            api_history.append({"role": "user", "parts": [{"text": f"{system_prompt}\n\nUSER QUESTION: {message}"}]})

            tools_config = tools.get_tools_config()
            
            full_response = ""
            for result in self.gemini_client.generate_response_stream(api_history, tools_config):
                # The generator now yields dictionaries, so we can check the type
                if result["type"] == "chunk":
                    full_response += result["content"]
                    yield json.dumps({"type": "chunk", "content": result["content"], "convo_id": convo_id}) + "\n"
                elif result["type"] == "error":
                    # If the client yields an error, pass it through
                    yield json.dumps(result) + "\n"
            
            self.memory.add_message_to_conversation(username, convo_id, message, full_response)
            
            yield json.dumps({"type": "end", "convo_id": convo_id}) + "\n"

        except Exception as e:
            logger.error(f"Error in get_response_stream: {e}", exc_info=True)
            yield json.dumps({"type": "error", "content": "A critical error occurred in the bot."}) + "\n"
