# File: main.py
# Description: The main FastAPI application server, with a final, robust fix for streaming.

import os
import logging
from contextlib import asynccontextmanager
import asyncio
import json

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from slack_bolt.async_app import AsyncApp
from slack_bolt.adapter.fastapi.async_handler import AsyncSlackRequestHandler

# Import the core bot logic and tools
from bot import iTethrBot
from team_manager import AEONOVX_TEAM
import tools

# --- Configuration & Initialization ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

SLACK_BOT_TOKEN = os.environ.get("SLACK_BOT_TOKEN")
SLACK_SIGNING_SECRET = os.environ.get("SLACK_SIGNING_SECRET")
slack_enabled = bool(SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET)

bot_instance = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global bot_instance
    logger.info("Application starting up...")
    bot_instance = iTethrBot()
    yield
    logger.info("Application shutting down...")
    if bot_instance:
        bot_instance.memory.save_memory()

app = FastAPI(lifespan=lifespan)

if slack_enabled:
    slack_app = AsyncApp(token=SLACK_BOT_TOKEN, signing_secret=SLACK_SIGNING_SECRET)
    slack_handler = AsyncSlackRequestHandler(slack_app)
else:
    logger.warning("Slack environment variables not found. Slack integration will be disabled.")

# --- Pydantic Models ---
class LoginRequest(BaseModel):
    name: str
    password: str

class ChatRequest(BaseModel):
    message: str
    username: str
    convo_id: str | None = None

# --- API Endpoints ---

@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": bot_instance.version if bot_instance else "loading"}

@app.post("/api/auth")
async def authenticate_user(login_data: LoginRequest):
    user = AEONOVX_TEAM.get(login_data.name)
    if user and user["password"] == login_data.password:
        logger.info(f"Authentication successful for: {login_data.name}")
        return {"success": True, "username": login_data.name, "role": user["role"]}
    raise HTTPException(status_code=401, detail="Invalid credentials")

# [FIX] Rewritten chat_endpoint for stability
@app.post("/api/chat")
def chat_endpoint(chat_data: ChatRequest):
    """
    Endpoint for the web UI to get a bot response.
    This endpoint now directly returns a StreamingResponse with a synchronous generator.
    FastAPI will handle running it in a thread pool automatically.
    """
    if not bot_instance:
        raise HTTPException(status_code=503, detail="Bot is not ready yet.")
    
    # The bot's get_response_stream is a synchronous generator.
    # We can pass it directly to StreamingResponse.
    return StreamingResponse(
        bot_instance.get_response_stream(
            chat_data.message, chat_data.username, chat_data.convo_id
        ),
        media_type="application/x-ndjson"
    )

# --- Endpoints for Conversation History ---
@app.get("/api/conversations/{username}")
async def get_user_conversations(username: str):
    if not bot_instance:
        raise HTTPException(status_code=503, detail="Bot is not ready yet.")
    history_list = bot_instance.memory.get_all_conversations_for_user(username)
    return JSONResponse(content=history_list)

@app.get("/api/conversation/{username}/{convo_id}")
async def get_conversation_history(username: str, convo_id: str):
    if not bot_instance:
        raise HTTPException(status_code=503, detail="Bot is not ready yet.")
    history = bot_instance.memory.get_conversation_history(username, convo_id)
    if not history:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return JSONResponse(content=history)

# (Slack integration and UI serving code remains the same)
# --- Slack Integration ---
if slack_enabled:
    # This part of the code is for Slack and does not need to be changed.
    # It uses a different mechanism for handling async tasks.
    async def process_slack_message(text, user_id, say):
        loop = asyncio.get_running_loop()
        # Use run_in_executor for the non-streaming Slack response
        response_data = await loop.run_in_executor(
            None, bot_instance.get_response, text, f"slack_{user_id}"
        )
        await say(response_data["response"])

    @slack_app.event("app_mention")
    async def handle_app_mentions(body, say, logger):
        user_id = body["event"]["user"]
        bot_user_id = body["authorizations"][0]["user_id"]
        text = body["event"]["text"].replace(f"<@{bot_user_id}>", "").strip()
        if text:
            await process_slack_message(text, user_id, say)

    @slack_app.event("message")
    async def handle_direct_messages(message, say, logger):
        if message.get("channel_type") == "im":
            user_id = message["user"]
            text = message["text"].strip()
            if text:
                await process_slack_message(text, user_id, say)

    @app.post("/slack/events")
    async def slack_events_handler(req: Request):
        return await slack_handler.handle(req)

# --- Web UI & Admin Dashboard Serving ---
app.mount("/static", StaticFiles(directory="web_ui"), name="static")

@app.get("/", response_class=HTMLResponse)
async def serve_home(request: Request):
    try:
        with open("web_ui/index.html", "r") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Web interface not found (index.html is missing).")

@app.get("/admin", response_class=HTMLResponse)
async def serve_admin_dashboard(request: Request):
    if not bot_instance:
        return HTMLResponse("Bot is still loading...", status_code=503)
    total_users = len(bot_instance.memory.user_conversations)
    total_convos = sum(len(convos) for convos in bot_instance.memory.user_conversations.values())
    html_content = f"""
    <!DOCTYPE html><html lang="en"><head><title>iBot Admin</title><style>body{{font-family:sans-serif;background-color:#121212;color:#e0e0e0;padding:20px;}}.container{{max-width:800px;margin:auto;background-color:#1e1e1e;padding:20px;border-radius:8px;}}h1{{border-bottom:1px solid #333;padding-bottom:10px;}}.stat{{background-color:#2a2a2a;padding:15px;border-radius:5px;margin:10px 0;}}.stat-label{{font-weight:bold;color:#aaa;}}.stat-value{{font-size:1.5em;}}</style></head>
    <body><div class="container"><h1>iBot Admin Dashboard</h1><div class="stat"><div class="stat-label">Bot Version</div><div class="stat-value">{bot_instance.version}</div></div><div class="stat"><div class="stat-label">Total Users with History</div><div class="stat-value">{total_users}</div></div><div class="stat"><div class="stat-label">Total Conversations Started</div><div class="stat-value">{total_convos}</div></div><div class="stat"><div class="stat-label">Slack Integration</div><div class="stat-value">{"Enabled" if slack_enabled else "Disabled"}</div></div></div></body></html>
    """
    return HTMLResponse(content=html_content)
