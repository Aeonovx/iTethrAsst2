# File: bot.py
# Description: The core logic for the iTethr Bot, with corrected prompt handling.

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

# (GeminiClient and ConversationMemory classes remain the same, no changes needed there)
class GeminiClient:
    """A client to interact with the Google Gemini API, now with streaming and function calling."""
    
    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError("Gemini API key is required.")
        self.api_key = api_key
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
                                func_call = part["functionCall"]
                                func_name = func_call["name"]
                                func_args = func_call["args"]
                                
                                logger.info(f"AI requested to call tool: {func_name} with args: {func_args}")
                                
                                tool_response = tools.execute_tool(func_name, func_args)
                                
                                conversation_history.append({"role": "model", "parts": [{"functionCall": func_call}]})
                                conversation_history.append({
                                    "role": "tool",
                                    "parts": [{"functionResponse": {"name": func_name, "response": {"result": tool_response}}}]
                                })
                                
                                yield from self.generate_response_stream(conversation_history, tools_config)
                                return

                except json.JSONDecodeError:
                    continue

class ConversationMemory:
    """Manages conversation history, now with unique IDs for each chat."""
    
    def __init__(self):
        self.user_conversations = defaultdict(list)
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
        convo_id = str(uuid.uuid4())
        new_convo = {
            "id": convo_id,
            "title": first_message[:40] + "...",
            "timestamp": datetime.now().isoformat(),
            "history": []
        }
        self.user_conversations[username].insert(0, new_convo)
        self.save_memory()
        return convo_id

    def add_message_to_conversation(self, username: str, convo_id: str, user_message: str, model_response: str):
        for convo in self.user_conversations[username]:
            if convo["id"] == convo_id:
                # [FIX] Ensure we don't save the massive system prompt in our history
                # We only save the actual user question.
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
        return [{"id": c["id"], "title": c["title"], "timestamp": c["timestamp"]} for c in self.user_conversations[username]]


class iTethrBot:
    """The core intelligence of the iTethr Bot, upgraded."""
    
    def __init__(self):
        self.version = "12.2.0-Prompt-Fix"
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
        docs_folder = './documents'
        if not os.path.exists(docs_folder):
            return logger.warning("Documents folder not found.")
        
        for filename in os.listdir(docs_folder):
            if filename.endswith(('.txt', '.md')):
                try:
                    with open(os.path.join(docs_folder, filename), 'r', encoding='utf-8') as f:
                        content = f.read()
                    chunks = self._create_chunks(content)
                    if chunks:
                        embeddings = self.embeddings_model.encode(chunks)
                        self.documents.extend(chunks)
                        self.embeddings.extend(embeddings)
                except Exception as e:
                    logger.error(f"Failed to load document '{filename}': {e}")
        
        if self.embeddings:
            self.embeddings = np.array(self.embeddings)
            logger.info(f"✅ Knowledge base loaded. Total chunks: {len(self.documents)}")

    def _create_chunks(self, content: str, chunk_size=400, overlap=50) -> List[str]:
        if not content: return []
        words = content.split()
        return [' '.join(words[i:i + chunk_size]) for i in range(0, len(words), chunk_size - overlap)]

    def _search_knowledge(self, question: str, top_k=3) -> str:
        if len(self.documents) == 0: return ""
        question_embedding = self.embeddings_model.encode([question])
        similarities = cosine_similarity(question_embedding, self.embeddings)[0]
        top_indices = np.argsort(similarities)[-top_k:][::-1]
        
        relevant_docs = [self.documents[idx] for idx in top_indices if similarities[idx] > 0.3]
        return "\n\n---\n\n".join(relevant_docs)

    def get_response_stream(self, message: str, username: str, convo_id: str = None) -> Generator[str, None, None]:
        if not convo_id:
            convo_id = self.memory.start_new_conversation(username, message)
        
        # This is the history of just user/model turns, without the system prompt
        clean_history = self.memory.get_conversation_history(username, convo_id)
        
        context = self._search_knowledge(message)
        if not context:
            context = "No relevant documentation was found for this query."
            
        system_prompt = f"""
        You are iBot, a friendly mentor and guide for the AeonovX team. Your goal is to explain the iTethr platform in a way that is easy to understand.
        **Your Personality:** Friendly, encouraging, and act like a helpful teammate. Avoid jargon. Use simple examples.
        **Instructions:** Use the `DOCUMENTATION CONTEXT` to answer. If the context is not relevant, say so politely. Use Markdown for readability.
        ---
        DOCUMENTATION CONTEXT: {context}
        ---
        """
        
        # [FIX] Construct the payload for the API call correctly.
        # The system prompt is only included with the very latest user message.
        api_history = list(clean_history) # Make a copy
        api_history.append({"role": "user", "parts": [{"text": f"{system_prompt}\n\nUSER QUESTION: {message}"}]})

        tools_config = tools.get_tools_config()
        
        full_response = ""
        for chunk in self.gemini_client.generate_response_stream(api_history, tools_config):
            full_response += chunk
            yield json.dumps({"type": "chunk", "content": chunk, "convo_id": convo_id}) + "\n"
        
        # Save the conversation with the original, clean user message
        self.memory.add_message_to_conversation(username, convo_id, message, full_response)
        
        yield json.dumps({"type": "end", "convo_id": convo_id}) + "\n"
