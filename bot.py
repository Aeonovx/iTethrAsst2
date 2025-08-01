# File: bot.py
# Description: The core logic for the iTethr Bot.
# [FIX] Updated tool-calling logic to correctly handle arguments.
# [IMPROVEMENT] Enhanced RAG, system prompt, and document loading.
# [FIX] Added the missing authenticate method.

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

import tools # Make sure tools.py is available
from team_manager import AEONOVX_TEAM # Import team data for authentication

# --- Configuration ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- Groq API Client ---
class GroqClient:
    def __init__(self, api_key: str):
        if not api_key: raise ValueError("Groq API key is required.")
        self.api_key = api_key
        self.api_url = "https://api.groq.com/openai/v1/chat/completions"
        self.model = "llama3-70b-8192"

    def generate_response_stream(self, conversation_history: List[Dict], tools_config: List[Dict]) -> Generator[Dict, None, None]:
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        payload = {
            "messages": conversation_history,
            "model": self.model,
            "stream": True,
            "tools": tools_config,
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
                if delta.get("content"):
                    yield {"type": "chunk", "content": delta["content"]}
                if delta.get("tool_calls"):
                    yield {"type": "tool_call", "call": delta["tool_calls"][0]}
            except (json.JSONDecodeError, KeyError, IndexError, AttributeError) as e:
                logger.warning(f"Could not parse a Groq stream chunk: {chunk_str}. Error: {e}")
                continue

class ConversationMemory:
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
        self.version = "14.2.0-Phoenix-Enhanced"
        groq_api_key = os.getenv("GROQ_API_KEY")
        if not groq_api_key: raise ValueError("GROQ_API_KEY is not set.")

        self.groq_client = GroqClient(api_key=groq_api_key)
        self.memory = ConversationMemory()
        self.embeddings_model = None
        self.documents = []
        self.embeddings = []
        self._setup_bot()
        logger.info(f"🚀 {self.version} logic core initialized with tools.")

    def authenticate(self, name: str, password: str) -> Dict:
        """Authenticates a user against the team database."""
        user_data = AEONOVX_TEAM.get(name)
        if user_data and user_data.get("password") == password:
            return {"username": name, "role": user_data.get("role")}
        return None

    def _setup_bot(self):
        try:
            self.embeddings_model = SentenceTransformer('all-MiniLM-L6-v2')
            self._load_all_documents()
        except Exception as e:
            logger.error(f"Fatal error during bot setup: {e}", exc_info=True)
            raise

    # [IMPROVEMENT] Implemented document loading and embedding.
    def _load_all_documents(self):
        doc_path = './documents'
        if not os.path.exists(doc_path):
            logger.warning(f"Documents directory not found: {doc_path}")
            return

        for filename in os.listdir(doc_path):
            if filename.endswith(".txt"):
                try:
                    with open(os.path.join(doc_path, filename), 'r', encoding='utf-8') as f:
                        content = f.read()
                        chunks = self._create_chunks(content)
                        self.documents.extend(chunks)
                        logger.info(f"Loaded and chunked document: {filename}")
                except Exception as e:
                    logger.error(f"Failed to read or chunk document {filename}: {e}")

        if self.documents:
            try:
                self.embeddings = self.embeddings_model.encode(self.documents, show_progress_bar=True)
                logger.info(f"Created {len(self.embeddings)} embeddings for the knowledge base.")
            except Exception as e:
                logger.error(f"Failed to create embeddings: {e}")


    def _create_chunks(self, content: str, chunk_size=400, overlap=50) -> List[str]:
        if not content: return []
        words = content.split()
        if not words: return []
        return [' '.join(words[i:i + chunk_size]) for i in range(0, len(words), chunk_size - overlap)]

    # [IMPROVEMENT] Added a similarity threshold to improve relevance.
    def _search_knowledge(self, question: str, top_k=3) -> str:
        if len(self.documents) == 0 or self.embeddings is None or len(self.embeddings) == 0:
            return ""
        try:
            question_embedding = self.embeddings_model.encode([question])
            similarities = cosine_similarity(question_embedding, self.embeddings)[0]
            top_indices = np.argsort(similarities)[-top_k:][::-1]
            # [IMPROVEMENT] Filter results by a similarity threshold.
            relevant_docs = [self.documents[idx] for idx in top_indices if similarities[idx] > 0.3]
            return "\n\n---\n\n".join(relevant_docs)
        except Exception as e:
            logger.error(f"Error during knowledge search: {e}")
            return ""

    def get_response_stream(self, message: str, username: str, user_info: Dict, convo_id: str = None) -> Generator[str, None, None]:
        try:
            if not convo_id:
                convo_id = self.memory.start_new_conversation(username, message)

            self.memory.add_message_to_conversation(username, convo_id, {"role": "user", "content": message})

            context = self._search_knowledge(message)

            # [IMPROVEMENT] Greatly enhanced system prompt for better performance.
            system_prompt = f"""
            You are iBot, an extremely fast, accurate, and helpful AI assistant for the iTethr team, Powered by AeonovX.
            Your version is {self.version}. You are an expert on the iTethr platform.

            You are currently speaking to {user_info.get('name', 'a team member')}, whose role is {user_info.get('role', 'Developer')}. Be respectful and professional.

            **Your Primary Directive:**
            1.  **Use Documentation First:** Your primary source of information is the `DOCUMENTATION CONTEXT` provided below. Base your answers on this context whenever possible.
            2.  **Be Accurate:** When citing the documentation, be precise. Do not make assumptions beyond what is written.
            3.  **Admit Ignorance:** If the documentation does not contain the answer, clearly state that the information is not in your documents and then try to answer using your general knowledge.
            4.  **Use Tools:** If you need the current time or date, you MUST use the `get_current_time` tool. Do not guess.
            5.  **Formatting:** Use Markdown for clear, readable formatting (e.g., lists, bolding, code blocks).

            ---
            DOCUMENTATION CONTEXT:
            {context if context else "No relevant documentation was found for this query."}
            ---
            """

            api_history = [{"role": "system", "content": system_prompt}]
            api_history.extend(self.memory.get_conversation_history(username, convo_id))

            tools_config_list = [tools.get_tools_config()]

            while True:
                full_bot_response = ""
                tool_calls_to_process = []

                for result in self.groq_client.generate_response_stream(api_history, tools_config_list):
                    if result["type"] == "chunk":
                        full_bot_response += result["content"]
                        yield json.dumps({"type": "chunk", "content": result["content"], "convo_id": convo_id}) + "\n"
                    elif result["type"] == "tool_call":
                        tool_calls_to_process.append(result['call'])
                    elif result["type"] == "error":
                        yield json.dumps(result) + "\n"
                        return

                if tool_calls_to_process:
                    assistant_message = {"role": "assistant", "content": None, "tool_calls": tool_calls_to_process}
                    self.memory.add__message_to_conversation(username, convo_id, assistant_message)
                    api_history.append(assistant_message)

                    for tool_call in tool_calls_to_process:
                        tool_name = tool_call['function']['name']
                        tool_args_str = tool_call['function']['arguments']
                        tool_call_id = tool_call['id']

                        # The model now correctly returns arguments as a stringified JSON object.
                        tool_output = tools.execute_tool(name=tool_name, args=tool_args_str)

                        tool_result_message = {
                            "role": "tool",
                            "tool_call_id": tool_call_id,
                            "content": json.dumps({"result": tool_output})
                        }
                        self.memory.add_message_to_conversation(username, convo_id, tool_result_message)
                        api_history.append(tool_result_message)

                    continue
                else:
                    self.memory.add_message_to_conversation(username, convo_id, {"role": "assistant", "content": full_bot_response})
                    yield json.dumps({"type": "end", "convo_id": convo_id}) + "\n"
                    break

        except Exception as e:
            logger.error(f"Critical error in get_response_stream: {e}", exc_info=True)
            yield json.dumps({"type": "error", "content": "A critical server error occurred."}) + "\n"