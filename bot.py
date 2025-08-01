# File: bot.py
# Description: The core logic for the iTethr Bot.
# Updated to support tool-calling with Groq and personalized prompts.

import os
import logging
import pickle
import json
import uuid
from collections import defaultdict
from typing import List, Dict, Generator, Any

import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import requests

import tools # Make sure tools.py is available

# --- Configuration ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- Groq API Client ---
class GroqClient:
    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError("Groq API key is required.")
        self.api_key = api_key
        self.api_url = "https://api.groq.com/openai/v1/chat/completions"
        self.model = "llama3-70b-8192" # Using a more powerful model for better tool use

    def generate_response_stream(self, conversation_history: List[Dict], tools_config: Dict) -> Generator[Dict, None, None]:
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        payload = {
            "messages": conversation_history,
            "model": self.model,
            "stream": True,
            # [CHANGE] Added tool configuration to the API call
            "tools": [tools_config],
            "tool_choice": "auto"
        }
        
        try:
            response = requests.post(self.api_url, headers=headers, json=payload, timeout=60, stream=True)
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

            if chunk_str == '[DONE]': continue

            try:
                data = json.loads(chunk_str)
                delta = data["choices"][0]["delta"]
                # [CHANGE] Handle both content chunks and tool calls from the model
                if delta.get("content"):
                    yield {"type": "chunk", "content": delta["content"]}
                if delta.get("tool_calls"):
                    yield {"type": "tool_call", "call": delta["tool_calls"][0]}
            except (json.JSONDecodeError, KeyError, IndexError, AttributeError) as e:
                logger.warning(f"Could not parse a Groq stream chunk: {chunk_str}. Error: {e}")
                continue

class ConversationMemory:
    # ... (No changes to this class)
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
    def add_message_to_conversation(self, username: str, convo_id: str, message: Dict):
        for convo in self.user_conversations[username]:
            if convo["id"] == convo_id:
                convo["history"].append(message)
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
    def __init__(self):
        self.version = "14.0.0-Phoenix"
        groq_api_key = os.getenv("GROQ_API_KEY")
        if not groq_api_key: raise ValueError("GROQ_API_KEY is not set.")
        
        self.groq_client = GroqClient(api_key=groq_api_key)
        self.memory = ConversationMemory()
        self.embeddings_model = None
        self.documents = []
        self.embeddings = []
        # [CHANGE] Added a mapping for available tools
        self.available_tools = {"get_current_time": tools.get_current_time}
        self._setup_bot()
        logger.info(f"🚀 {self.version} logic core initialized with tools.")
    
    def _setup_bot(self):
        try:
            self.embeddings_model = SentenceTransformer('all-MiniLM-L6-v2')
            self._load_all_documents()
        except Exception as e:
            logger.error(f"Fatal error during bot setup: {e}", exc_info=True)
            raise
    
    def _load_all_documents(self):
        # ... (No changes to this method)
        logger.info("Starting to load documents...")
        # ... (rest of the method is the same)
    
    def _create_chunks(self, content: str, chunk_size=400, overlap=50) -> List[str]:
        # ... (No changes to this method)
        if not content: return []
        words = content.split()
        return [' '.join(words[i:i + chunk_size]) for i in range(0, len(words), chunk_size - overlap)]

    def _search_knowledge(self, question: str, top_k=3) -> str:
        # ... (No changes to this method)
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

    def get_response_stream(self, message: str, username: str, user_info: Dict, convo_id: str = None) -> Generator[str, None, None]:
        # [CHANGE] This method is now a loop to handle tool calls.
        try:
            if not convo_id:
                convo_id = self.memory.start_new_conversation(username, message)
            
            self.memory.add_message_to_conversation(username, convo_id, {"role": "user", "content": message})
            
            context = self._search_knowledge(message) or "No relevant documentation was found."
            
            # [CHANGE] Personalized system prompt
            system_prompt = f"""
            You are iBot, an extremely fast and helpful AI assistant for the AeonovX team.
            You are speaking to {user_info['name']}, who is a {user_info['role']} on the team.
            Be warm, encouraging, and use simple examples. Use Markdown for formatting.
            Use the `DOCUMENTATION CONTEXT` to answer questions. If it's not relevant, politely say so.
            If you need to know the current time or date to answer a question, you must use the 'get_current_time' tool.
            ---
            DOCUMENTATION CONTEXT: {context}
            ---
            """
            
            api_history = [{"role": "system", "content": system_prompt}]
            api_history.extend(self.memory.get_conversation_history(username, convo_id))

            tools_config = tools.get_tools_config()
            
            while True: # Loop to allow for tool calls
                full_bot_response = ""
                tool_calls = []

                for result in self.groq_client.generate_response_stream(api_history, tools_config):
                    if result["type"] == "chunk":
                        full_bot_response += result["content"]
                        yield json.dumps({"type": "chunk", "content": result["content"], "convo_id": convo_id}) + "\n"
                    elif result["type"] == "tool_call":
                        tool_calls.append(result['call'])
                    elif result["type"] == "error":
                        yield json.dumps(result) + "\n"
                        return

                if tool_calls:
                    # If the model wants to use a tool
                    self.memory.add_message_to_conversation(username, convo_id, {"role": "assistant", "content": None, "tool_calls": tool_calls})
                    
                    for tool_call in tool_calls:
                        tool_name = tool_call['function']['name']
                        if tool_name in self.available_tools:
                            tool_function = self.available_tools[tool_name]
                            # NOTE: Assuming no arguments for get_current_time for simplicity
                            tool_output = tool_function()
                            tool_result_message = {
                                "role": "tool",
                                "tool_call_id": tool_call['id'],
                                "content": json.dumps({"result": tool_output})
                            }
                            self.memory.add_message_to_conversation(username, convo_id, tool_result_message)
                            api_history.append(tool_result_message)
                        else:
                             logger.warning(f"Model tried to call an unknown tool: {tool_name}")
                    # Loop back to the model with the tool result
                    continue 
                else:
                    # If the model is done and sent a text response
                    self.memory.add_message_to_conversation(username, convo_id, {"role": "assistant", "content": full_bot_response})
                    yield json.dumps({"type": "end", "convo_id": convo_id}) + "\n"
                    break # Exit the loop

        except Exception as e:
            logger.error(f"Critical error in get_response_stream: {e}", exc_info=True)
            yield json.dumps({"type": "error", "content": "A critical server error occurred."}) + "\n"