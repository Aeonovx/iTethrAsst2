# File: main.py
# Description: Final, stable version of the FastAPI application server.

import logging
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn

from bot import iTethrBot
from team_manager import AEONOVX_TEAM
import tools

# --- Configuration & Initialization ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI()

try:
    bot_instance = iTethrBot()
    logger.info("✅ iTethrBot instance created successfully.")
except Exception as e:
    logger.error(f"FATAL: Could not initialize iTethrBot. Error: {e}", exc_info=True)
    bot_instance = None

# --- Pydantic Models ---
class AuthRequest(BaseModel):
    name: str
    password: str

class ChatRequest(BaseModel):
    message: str
    username: str
    user_info: dict
    convo_id: str | None = None

# --- API Endpoints ---
@app.post("/api/auth")
async def auth_endpoint(request: AuthRequest):
    user_data = AEONOVX_TEAM.get(request.name)
    if user_data and user_data["password"] == request.password:
        logger.info(f"User '{request.name}' authenticated successfully.")
        return JSONResponse(content={"username": request.name, "role": user_data["role"]})
    
    logger.warning(f"Failed authentication attempt for user '{request.name}'.")
    raise HTTPException(status_code=401, detail="Invalid credentials")

@app.post("/api/chat")
def chat_endpoint(request: ChatRequest):
    if not bot_instance:
        raise HTTPException(status_code=503, detail="Bot is not ready yet.")
    
    return StreamingResponse(
        bot_instance.get_response_stream(
            message=request.message,
            username=request.username,
            user_info=request.user_info,
            convo_id=request.convo_id
        ),
        media_type="application/x-ndjson"
    )

@app.get("/api/conversations/{username}")
async def get_conversations(username: str):
    if not bot_instance:
        raise HTTPException(status_code=503, detail="Bot not available")
    return bot_instance.memory.get_all_conversations_for_user(username)

@app.get("/api/conversation/{username}/{convo_id}")
async def get_conversation(username: str, convo_id: str):
    if not bot_instance:
        raise HTTPException(status_code=503, detail="Bot not available")
    history = bot_instance.memory.get_conversation_history(username, convo_id)
    return JSONResponse(content=history)

app.mount("/", StaticFiles(directory="web_ui", html=True), name="static")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)