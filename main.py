# main.py

import uvicorn
import os
import logging
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
import asyncio
from fastapi.middleware.cors import CORSMiddleware

# Assuming your iTethrBot class is in 'bot.py'
from bot import iTethrBot

# --- Basic Setup ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("main")

# --- FastAPI App Initialization ---
app = FastAPI(
    title="iTethr Bot API",
    description="Backend services for the iTethr conversational AI.",
    version="14.2.0-Phoenix"
)

# --- Add CORS Middleware ---
origins = ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Mount Static Files ---
app.mount("/static", StaticFiles(directory="web_ui"), name="static")

# --- Template Engine Setup ---
templates = Jinja2Templates(directory="web_ui")

# --- Data Models ---
class AuthRequest(BaseModel):
    name: str
    password: str

class ChatRequest(BaseModel):
    message: str
    username: str
    # [CRITICAL FIX] Corrected type hint to allow convo_id to be a string OR None.
    convo_id: str | None = None
    user_info: dict = {}

# --- Bot Initialization ---
try:
    bot = iTethrBot()
    logger.info("✅ iTethrBot instance created successfully.")
except Exception as e:
    logger.error(f"❌ Failed to initialize iTethrBot: {e}", exc_info=True)
    bot = None

# --- API Endpoints ---

@app.get("/", summary="Serve Frontend HTML", include_in_schema=False)
async def serve_frontend(request: Request):
    """Serves the main index.html file that powers the web UI."""
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/api/auth", summary="Authenticate User")
async def authenticate_user(auth_request: AuthRequest):
    """Handles user authentication."""
    if not bot:
        raise HTTPException(status_code=503, detail="Bot is not initialized.")
    user = bot.authenticate(auth_request.name, auth_request.password)
    if user:
        logger.info(f"Authentication successful for user: {user['username']}")
        return {"status": "success", "username": user['username'], "role": user['role']}
    else:
        logger.warning(f"Authentication failed for user: {auth_request.name}")
        raise HTTPException(status_code=401, detail="Invalid credentials")

@app.post("/api/chat", summary="Process Chat Message with Streaming")
async def chat_endpoint(chat_request: ChatRequest):
    """Receives a message and streams the bot's response back to the client."""
    if not bot:
        raise HTTPException(status_code=503, detail="Bot service is not available.")

    try:
        # The generator function that yields response chunks
        async def stream_generator():
            g = bot.get_response_stream(
                message=chat_request.message,
                username=chat_request.username,
                user_info=chat_request.user_info,
                convo_id=chat_request.convo_id
            )
            for chunk in g:
                yield chunk
                await asyncio.sleep(0.01) # Yield control to the event loop

        return StreamingResponse(stream_generator(), media_type="text/event-stream")
    except Exception as e:
        logger.error(f"Error creating stream generator: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to start chat stream.")

# --- Server Execution ---
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)