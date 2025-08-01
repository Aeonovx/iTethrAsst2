# File: bot.py
# Description: The core logic for the iTethr Bot, powered by the Gemini API. (API Key & Memory Fix)

import os
import logging
import pickle
import time
import json
from datetime import datetime
from collections import defaultdict, deque
from typing import List, Tuple, Optional, Dict, Any

import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import requests

from team_manager import AEONOVX_TEAM

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# [FIX] Define a top-level function for creating deques so it can be pickled.
def create_conversation_deque():
    """Creates a deque with a max length of 50 for conversation history."""
    return deque(maxlen=50)

class GeminiClient:
    """A client to interact with the Google Gemini API."""
    
    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError("Gemini API key is required.")
        # [FIX] The API key is now correctly appended to the request URL.
        self.api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key={api_key}"
        self.suggestion_schema = {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {"suggestion": {"type": "STRING"}},
                "required": ["suggestion"]
            }
        }

    def _make_request_with_retries(self, payload: Dict, max_retries=3, initial_delay=1):
        """Makes a synchronous request to the Gemini API with exponential backoff."""
        delay = initial_delay
        for attempt in range(max_retries):
            try:
                response = requests.post(self.api_url, json=payload, timeout=20)
                response.raise_for_status()
                return response.json()
            except requests.exceptions.RequestException as e:
                logger.warning(f"API request failed on attempt {attempt + 1}: {e}. Retrying in {delay}s...")
                time.sleep(delay)
                delay *= 2
        logger.error("API request failed after all retries.")
        return None

    def generate_response(self, context: str, question: str, user_context_summary: str) -> str:
        """Generates a conversational response from Gemini."""
        prompt = f"""You are iBot, the expert AI assistant for the iTethr platform.
        USER CONTEXT: {user_context_summary}
        DOCUMENTATION CONTEXT: --- {context} ---
        USER'S QUESTION: {question}
        INSTRUCTIONS: Answer the user's question using ONLY the provided documentation context. If the answer isn't in the documentation, state that clearly and professionally. Be friendly, helpful, and concise. Format your answer using Markdown.
        ANSWER:"""

        payload = {"contents": [{"role": "user", "parts": [{"text": prompt}]}]}
        api_response = self._make_request_with_retries(payload)
        
        if api_response and api_response.get('candidates'):
            return api_response['candidates'][0]['content']['parts'][0]['text']
        
        logger.error("Failed to generate a valid response from Gemini.")
        return "I'm sorry, I encountered an issue while generating a response. Please try again."

    def generate_suggestions(self, context: str, question: str) -> List[str]:
        """Generates a list of smart suggestions using a structured JSON schema."""
        prompt = f"""Based on the user's question and the provided context, generate exactly 3 brief, relevant follow-up questions a user might ask next.
        CONTEXT: --- {context} ---
        USER QUESTION: {question}"""
        
        payload = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": self.suggestion_schema
            }
        }
        api_response = self._make_request_with_retries(payload)

        if api_response and api_response.get('candidates'):
            try:
                suggestions_json = json.loads(api_response['candidates'][0]['content']['parts'][0]['text'])
                return [item['suggestion'] for item in suggestions_json]
            except (json.JSONDecodeError, KeyError) as e:
                logger.error(f"Failed to parse suggestions from Gemini: {e}")
        
        return []


class ConversationMemory:
    """Manages conversation history and user context."""
    
    def __init__(self):
        # [FIX] Use the pickleable top-level function as the default factory.
        self.user_conversations = defaultdict(create_conversation_deque)
        self._load_memory()
    
    def _load_memory(self):
        try:
            if os.path.exists('./data/memory.pkl'):
                with open('./data/memory.pkl', 'rb') as f:
                    # Load the dictionary and convert lists back to deques if necessary
                    saved_data = pickle.load(f)
                    loaded_conversations = saved_data.get('conversations', {})
                    for user, convos in loaded_conversations.items():
                        self.user_conversations[user] = deque(convos, maxlen=50)
                logger.info("💾 Conversation memory loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to load memory: {e}")
    
    def save_memory(self):
        try:
            os.makedirs('./data', exist_ok=True)
            # Convert deques to lists for saving, just in case
            to_save = {user: list(convos) for user, convos in self.user_conversations.items()}
            with open('./data/memory.pkl', 'wb') as f:
                pickle.dump({'conversations': to_save}, f)
        except Exception as e:
            logger.error(f"Failed to save memory: {e}", exc_info=True)
    
    def add_conversation(self, username: str, question: str, response: str):
        self.user_conversations[username].append({'question': question, 'response': response})
        self.save_memory()

    def get_conversation_summary(self, username: str) -> str:
        recent_convos = list(self.user_conversations.get(username, []))[-3:]
        user_role = AEONOVX_TEAM.get(username, {}).get('role', 'Team Member')
        summary = f"Role: {user_role}"
        if recent_convos:
             summary += f" | Recent questions: {[conv['question'] for conv in recent_convos]}"
        return summary


class iTethrBot:
    """The core intelligence of the iTethr Bot, using Gemini."""
    
    def __init__(self):
        self.version = "11.0.2-API-Fix"
        
        # [FIX] Read the API key from environment variables and pass it to the client.
        gemini_api_key = os.getenv("GEMINI_API_KEY")
        if not gemini_api_key:
            logger.error("GEMINI_API_KEY environment variable not found. Bot will not function.")
            raise ValueError("GEMINI_API_KEY is not set.")
            
        self.gemini_client = GeminiClient(api_key=gemini_api_key)
        self.memory = ConversationMemory()
        self.documents = []
        self.embeddings = []
        self.metadata = []
        self._setup_bot()
        logger.info(f"🚀 {self.version} logic core initialized.")
    
    def _setup_bot(self):
        try:
            logger.info("Loading sentence-transformer model for RAG...")
            self.embeddings_model = SentenceTransformer('all-MiniLM-L6-v2')
            self._load_all_documents()
            logger.info("✅ Bot setup complete.")
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
                        self.metadata.extend([{"filename": filename}] * len(chunks))
                except Exception as e:
                    logger.error(f"Failed to load document '{filename}': {e}")
        
        if self.embeddings:
            self.embeddings = np.array(self.embeddings)
            logger.info(f"✅ Knowledge base loaded. Total chunks: {len(self.documents)}")

    def _create_chunks(self, content: str, chunk_size=400, overlap=50) -> List[str]:
        if not content: return []
        words = content.split()
        return [' '.join(words[i:i + chunk_size]) for i in range(0, len(words), chunk_size - overlap)]

    def _search_knowledge(self, question: str, top_k=3) -> List[str]:
        if len(self.embeddings) == 0: return []
        question_embedding = self.embeddings_model.encode([question])
        similarities = cosine_similarity(question_embedding, self.embeddings)[0]
        top_indices = np.argsort(similarities)[-top_k:][::-1]
        return [self.documents[idx] for idx in top_indices if similarities[idx] > 0.3]

    def get_response(self, message: str, username: str) -> Dict[str, Any]:
        """Main synchronous method to get a response from the bot."""
        start_time = time.time()
        
        if not message.strip():
            return {"response": "Hi there! How can I help you?", "suggestions": []}

        user_context_summary = self.memory.get_conversation_summary(username)
        relevant_docs = self._search_knowledge(message)
        
        if not relevant_docs:
            context = "No relevant documentation found."
            response_text = "I couldn't find specific information about that. Please try rephrasing."
            suggestions = ["What is iTethr?", "How do communities work?", "Explain the bubble interface."]
        else:
            context = "\n\n---\n\n".join(relevant_docs)
            response_text = self.gemini_client.generate_response(context, message, user_context_summary)
            suggestions = self.gemini_client.generate_suggestions(context, message)

        self.memory.add_conversation(username, message, response_text)
        
        logger.info(f"Response for '{username}' generated in {time.time() - start_time:.2f}s.")
        return {"response": response_text, "suggestions": suggestions}
