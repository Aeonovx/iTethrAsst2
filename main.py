# File: main.py
# Description: The main FastAPI application server for the iTethr Bot. (Synchronous Correction)

import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from slack_bolt.async_app import AsyncApp
from slack_bolt.adapter.fastapi.async_handler import AsyncSlackRequestHandler
import asyncio

from bot import iTethrBot
from team_manager import AEONOVX_TEAM

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
    # Bot initialization is synchronous and can be intensive, so it's fine here
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

@app.post("/api/chat")
async def chat_endpoint(chat_data: ChatRequest):
    if not bot_instance:
        raise HTTPException(status_code=503, detail="Bot is not ready yet.")
    try:
        # FastAPI runs synchronous functions in a thread pool, so this doesn't block the event loop.
        response_data = bot_instance.get_response(chat_data.message, chat_data.username)
        return JSONResponse(content=response_data)
    except Exception as e:
        logger.error(f"Error in chat endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error processing request.")

# --- Slack Integration ---
if slack_enabled:
    async def process_slack_message(text, user_id, say):
        # Run the synchronous bot method in an executor to avoid blocking the async event loop
        loop = asyncio.get_running_loop()
        response_data = await loop.run_in_executor(
            None,  # Use the default executor
            bot_instance.get_response,
            text,
            f"slack_{user_id}"
        )
        await say(response_data["response"])

    @slack_app.event("app_mention")
    async def handle_app_mentions(body, say, logger):
        user_id = body["event"]["user"]
        bot_user_id = body["authorizations"][0]["user_id"]
        text = body["event"]["text"].replace(f"<@{bot_user_id}>", "").strip()
        logger.info(f"Received app_mention from {user_id}: '{text}'")
        if text:
            await process_slack_message(text, user_id, say)

    @slack_app.event("message")
    async def handle_direct_messages(message, say, logger):
        if message.get("channel_type") == "im":
            user_id = message["user"]
            text = message["text"].strip()
            logger.info(f"Received DM from {user_id}: '{text}'")
            if text:
                await process_slack_message(text, user_id, say)

    @app.post("/slack/events")
    async def slack_events_handler(req: Request):
        return await slack_handler.handle(req)

# --- Web UI Serving ---
app.mount("/static", StaticFiles(directory="web_ui"), name="static")

@app.get("/", response_class=HTMLResponse)
async def serve_home(request: Request):
    try:
        with open("web_ui/index.html", "r") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Web interface not found (index.html is missing).")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
