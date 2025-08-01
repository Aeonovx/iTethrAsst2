# File: bot.py
# Description: The core logic for the iTethr Bot, now powered by the Groq API for high-speed responses.

import os
import logging
import pickle
import json
import uuid
from collections import defaultdict
from typing import List, Dict, Generator

import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import requests

# --- Configuration ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- NEW: Groq API Client ---
class GroqClient:
    """A client to interact with the Groq API."""
    
    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError("Groq API key is required.")
        self.api_key = api_key
        self.api_url = "https://api.groq.com/openai/v1/chat/completions"
        self.model = "llama3-8b-8192" # A fast and capable model from Groq

    def generate_response_stream(self, conversation_history: List[Dict]) -> Generator[Dict, None, None]:
        """Generates a response from Groq, yielding dictionary objects."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "messages": conversation_history,
            "model": self.model,
            "stream": True,
        }
        
        try:
            response = requests.post(self.api_url, headers=headers, json=payload, timeout=45, stream=True)
            response.raise_for_status()
        except requests.exceptions.RequestException as e:
            logger.error(f"API request to Groq failed: {e}")
            yield {"type": "error", "content": f"Connection to AI model failed. Error: {e}"}
            return

        for chunk in response.iter_lines():
            if not chunk: continue
            chunk_str = chunk.decode('utf-8').strip()
            if chunk_str.startswith('data: '):
                chunk_str = chunk_str[6:]

            if chunk_str == '[DONE]':
                continue

            try:
                data = json.loads(chunk_str)
                if data["choices"][0]["delta"].get("content"):
                    content = data["choices"][0]["delta"]["content"]
                    yield {"type": "chunk", "content": content}
            except (json.JSONDecodeError, KeyError, IndexError, AttributeError) as e:
                logger.warning(f"Could not parse a Groq stream chunk: {chunk_str}. Error: {e}")
                continue


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
                convo["history"].append({"role": "user", "content": user_message})
                convo["history"].append({"role": "assistant", "content": model_response})
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
    """The core intelligence of the iTethr Bot, now powered by Groq."""
    
    def __init__(self):
        self.version = "13.0.0-Groq"
        # UPDATED: Read GROQ_API_KEY instead of GEMINI_API_KEY
        groq_api_key = os.getenv("GROQ_API_KEY")
        if not groq_api_key:
            raise ValueError("GROQ_API_KEY environment variable is not set.")
            
        self.groq_client = GroqClient(api_key=groq_api_key)
        self.memory = ConversationMemory()
        self.embeddings_model = None
        self.documents = []
        self.embeddings = []
        self._setup_bot()
        logger.info(f"🚀 {self.version} logic core initialized.")
    
    def _setup_bot(self):
        try:
            logger.info("Initializing bot setup...")
            self.embeddings_model = SentenceTransformer('all-MiniLM-L6-v2')
            self._load_all_documents()
            logger.info("✅ Bot setup complete.")
        except Exception as e:
            logger.error(f"Fatal error during bot setup: {e}", exc_info=True)
            raise
    
    def _load_all_documents(self):
        logger.info("Starting to load documents from ./documents folder...")
        docs_folder = './documents'
        if not os.path.exists(docs_folder):
            return logger.warning("Documents folder not found. Knowledge base will be empty.")
        
        doc_count = 0
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
                        doc_count += 1
                except Exception as e:
                    logger.error(f"Failed to load document '{filename}': {e}")
        
        if self.embeddings:
            self.embeddings = np.array(self.embeddings)
        else:
            logger.warning("⚠️ Knowledge base is empty. No documents were loaded.")

    def _create_chunks(self, content: str, chunk_size=400, overlap=50) -> List[str]:
        if not content: return []
        words = content.split()
        return [' '.join(words[i:i + chunk_size]) for i in range(0, len(words), chunk_size - overlap)]

    def _search_knowledge(self, question: str, top_k=3) -> str:
        if len(self.documents) == 0: return ""
        
        try:
            question_embedding = self.embeddings_model.encode([question])
            similarities = cosine_similarity(question_embedding, self.embeddings)[0]
            top_indices = np.argsort(similarities)[-top_k:][::-1]
            relevant_docs = [self.documents[idx] for idx in top_indices if similarities[idx] > 0.3]
            return "\n\n---\n\n".join(relevant_docs)
        except Exception as e:
            logger.error(f"Error during knowledge search: {e}")
            return ""

    def get_response_stream(self, message: str, username: str, convo_id: str = None) -> Generator[str, None, None]:
        try:
            if not convo_id:
                convo_id = self.memory.start_new_conversation(username, message)
            
            clean_history = self.memory.get_conversation_history(username, convo_id)
            context = self._search_knowledge(message) or "No relevant documentation was found for this query."
            
            system_prompt = f"""
            You are iBot, a friendly and extremely fast mentor for the AeonovX team.
            **Personality:** Be warm, encouraging, and use simple examples. Use Markdown for formatting.
            **Context:** Use the `DOCUMENTATION CONTEXT` to answer the user's question. If it's not relevant, politely state that the documentation doesn't contain the answer.
            ---
            DOCUMENTATION CONTEXT: {context}
            ---
            """
            
            # UPDATED: Format history for Groq's OpenAI-compatible API
            api_history = [{"role": "system", "content": system_prompt}]
            api_history.extend(clean_history)
            api_history.append({"role": "user", "content": message})

            full_response = ""
            # UPDATED: Call the new groq_client
            for result in self.groq_client.generate_response_stream(api_history):
                if result["type"] == "chunk":
                    full_response += result["content"]
                    yield json.dumps({"type": "chunk", "content": result["content"], "convo_id": convo_id}) + "\n"
                elif result["type"] == "error":
                    yield json.dumps(result) + "\n"
            
            if full_response:
                self.memory.add_message_to_conversation(username, convo_id, message, full_response)
            
            yield json.dumps({"type": "end", "convo_id": convo_id}) + "\n"

        except Exception as e:
            logger.error(f"Critical error in get_response_stream: {e}", exc_info=True)
            yield json.dumps({"type": "error", "content": "A critical error occurred in the bot's main logic."}) + "\n"