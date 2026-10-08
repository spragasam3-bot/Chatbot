"""
FastAPI Main Application & REST API Endpoints
=============================================

EDUCATIONAL CONCEPTS FOR STUDENTS:
-----------------------------------
1. Request Lifecycle in FastAPI:
   Browser (HTTP Fetch / SSE) -> FastAPI Router -> Pydantic Validation
   -> Database Query (SQLite) -> LLM Service (OpenAI) -> Response
   -> Database Commit -> Browser Rendering.

2. Server-Sent Events (SSE):
   SSE is a lightweight HTTP streaming standard. Instead of opening a bidirectional
   WebSocket, the browser initiates a standard HTTP GET/POST with an 'Accept: text/event-stream'
   header. The server keeps the HTTP connection open and yields data blocks formatted as:
       data: {"type": "chunk", "delta": "hello"}\n\n
   This is ideal for LLM completions because data flows in one direction (server to client).

3. Static File Serving:
   By mounting the `frontend/` directory at the root (`/`), FastAPI can act as a full-stack
   web server serving HTML, CSS, and JS without needing NGINX or Apache during development.
"""

import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from backend.config import BASE_DIR, settings
from backend.database import (
    add_message,
    clear_conversation_messages,
    create_conversation,
    delete_conversation,
    get_all_conversations,
    get_conversation,
    get_messages,
    init_db,
    update_conversation_title,
)
from backend.models import (
    ChatNonStreamResponse,
    ChatRequest,
    ConversationCreate,
    ConversationDetailResponse,
    ConversationResponse,
    HealthResponse,
    MessageCreate,
    MessageResponse,
)
from backend.chatbot import chatbot_service

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application Lifespan Context:
    Runs startup actions (e.g. database schema creation) when server starts,
    and cleanup actions when server shuts down.
    """
    logger.info("Initializing database schema at: %s", settings.DATABASE_PATH)
    init_db()
    yield
    logger.info("Application shutting down.")


app = FastAPI(
    title="AI Chatbot API",
    description="Production-quality LLM Chatbot backend built with FastAPI, SQLite, and OpenAI.",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Middleware (allows local testing across different browser origins if needed)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==============================================================================
# System & Diagnostics Endpoints
# ==============================================================================

@app.get("/api/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """Verify application operational status and API key readiness."""
    return HealthResponse(
        status="ok",
        api_key_configured=settings.is_api_key_configured(),
        default_model=settings.OPENAI_MODEL,
        database="connected"
    )


@app.get("/api/models", tags=["Configuration"])
async def get_models():
    """Return the list of curated models and the active default model."""
    return {
        "success": True,
        "default_model": settings.OPENAI_MODEL,
        "models": settings.AVAILABLE_MODELS,
        "default_system_prompt": settings.DEFAULT_SYSTEM_PROMPT,
        "default_temperature": settings.DEFAULT_TEMPERATURE,
        "default_max_tokens": settings.DEFAULT_MAX_TOKENS,
        "api_key_configured": settings.is_api_key_configured()
    }


# ==============================================================================
# Conversation Management Endpoints
# ==============================================================================

@app.get("/api/conversations", response_model=list[ConversationResponse], tags=["Conversations"])
async def list_conversations():
    """Retrieve all conversations ordered by recent activity."""
    conversations = get_all_conversations()
    return [
        ConversationResponse(
            id=c["id"],
            title=c["title"],
            created_at=c["created_at"],
            updated_at=c["updated_at"],
            message_count=c["message_count"]
        )
        for c in conversations
    ]


@app.post("/api/conversations", response_model=ConversationResponse, tags=["Conversations"])
async def create_new_conversation(payload: ConversationCreate = ConversationCreate()):
    """Create a new blank conversation."""
    title = payload.title.strip() if payload.title else "New Chat"
    conv_id = create_conversation(title=title)
    conv = get_conversation(conv_id)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to initialize conversation in database."
        )
    return ConversationResponse(
        id=conv["id"],
        title=conv["title"],
        created_at=conv["created_at"],
        updated_at=conv["updated_at"],
        message_count=0
    )


@app.get(
    "/api/conversations/{conversation_id}",
    response_model=ConversationDetailResponse,
    tags=["Conversations"]
)
async def get_conversation_details(conversation_id: str):
    """Retrieve a single conversation and its entire chronological message history."""
    conv = get_conversation(conversation_id)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found."
        )
    raw_messages = get_messages(conversation_id)
    messages = [
        MessageResponse(
            id=m["id"],
            conversation_id=m["conversation_id"],
            role=m["role"],
            content=m["content"],
            created_at=m["created_at"]
        )
        for m in raw_messages
    ]
    return ConversationDetailResponse(
        id=conv["id"],
        title=conv["title"],
        created_at=conv["created_at"],
        updated_at=conv["updated_at"],
        messages=messages
    )


@app.delete("/api/conversations/{conversation_id}", tags=["Conversations"])
async def delete_single_conversation(conversation_id: str):
    """Permanently delete a conversation and its messages."""
    existed = delete_conversation(conversation_id)
    if not existed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found or already deleted."
        )
    return {"success": True, "message": "Conversation deleted successfully."}


@app.post("/api/conversations/{conversation_id}/clear", tags=["Conversations"])
async def clear_chat_history(conversation_id: str):
    """Delete all messages in a conversation while preserving the chat container."""
    conv = get_conversation(conversation_id)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found."
        )
    clear_conversation_messages(conversation_id)
    return {"success": True, "message": "Conversation messages cleared successfully."}


@app.post(
    "/api/conversations/{conversation_id}/messages",
    response_model=MessageResponse,
    tags=["Messages"]
)
async def append_message_to_conversation(conversation_id: str, payload: MessageCreate):
    """Manually append a message to a conversation."""
    conv = get_conversation(conversation_id)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found."
        )
    msg = add_message(conversation_id, payload.role, payload.content)
    return MessageResponse(
        id=msg["id"],
        conversation_id=msg["conversation_id"],
        role=msg["role"],
        content=msg["content"],
        created_at=msg["created_at"]
    )


# ==============================================================================
# Primary Chat Execution Endpoint (Streaming & Non-Streaming)
# ==============================================================================

@app.post("/api/chat", tags=["Chat"])
async def chat_endpoint(request: ChatRequest):
    """
    Primary chat completion endpoint.
    - Persists user prompt in SQLite.
    - Auto-generates a concise title on the first message.
    - Streams tokens back via Server-Sent Events (SSE) if stream=True.
    - Persists generated assistant response in SQLite upon completion.
    """
    user_prompt = request.message.strip()
    if not user_prompt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message content cannot be blank."
        )

    # 1. Resolve or create conversation
    conv_id = request.conversation_id
    is_new_chat = False

    if conv_id:
        conv = get_conversation(conv_id)
        if not conv:
            # If provided ID doesn't exist, create fresh
            conv_id = create_conversation(title="New Chat")
            is_new_chat = True
    else:
        conv_id = create_conversation(title="New Chat")
        is_new_chat = True

    # 2. Retrieve past message history for context memory BEFORE appending current user prompt
    history = get_messages(conv_id)

    # If this conversation has 0 messages, or its title is 'New Chat', generate a title
    conv = get_conversation(conv_id)
    current_title = conv["title"] if conv else "New Chat"
    auto_title = current_title
    if current_title in ("New Chat", ""):
        auto_title = chatbot_service.generate_title_from_text(user_prompt)
        update_conversation_title(conv_id, auto_title)

    # 3. Store the user's message in the database
    user_msg_record = add_message(conv_id, "user", user_prompt)

    # 4. Prepare message payload for the LLM
    llm_messages = chatbot_service.format_history_for_llm(
        history=history,
        current_message=user_prompt,
        system_prompt=request.system_prompt
    )

    # 5. Handle Streaming Response (Server-Sent Events)
    if request.stream:
        async def event_generator() -> AsyncGenerator[str, None]:
            """
            Async generator that formats events according to SSE specification:
            data: <JSON payload>\n\n
            """
            # Signal start of response with metadata
            yield f"data: {json.dumps({'type': 'start', 'conversation_id': conv_id, 'title': auto_title})}\n\n"

            accumulated_response_parts: list[str] = []

            async for event in chatbot_service.stream_response(
                messages=llm_messages,
                model=request.model,
                temperature=request.temperature,
                max_tokens=request.max_tokens
            ):
                event_type = event.get("type")

                if event_type == "chunk":
                    delta = event.get("delta", "")
                    accumulated_response_parts.append(delta)
                    yield f"data: {json.dumps({'type': 'chunk', 'delta': delta})}\n\n"

                elif event_type == "metrics":
                    yield f"data: {json.dumps(event)}\n\n"

                elif event_type == "error":
                    yield f"data: {json.dumps(event)}\n\n"
                    return

            # Save complete assistant response to SQLite
            full_content = "".join(accumulated_response_parts)
            if full_content.strip():
                asst_msg_record = add_message(conv_id, "assistant", full_content)
                yield f"data: {json.dumps({'type': 'end', 'conversation_id': conv_id, 'message_id': asst_msg_record['id'], 'title': auto_title})}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'end', 'conversation_id': conv_id, 'title': auto_title})}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"  # Prevents Nginx/proxy buffer delay
            }
        )

    # 6. Handle Non-Streaming Response (Fallback)
    try:
        full_content = await chatbot_service.get_complete_response(
            messages=llm_messages,
            model=request.model,
            temperature=request.temperature,
            max_tokens=request.max_tokens
        )
    except Exception as e:
        logger.exception("Error in non-streaming chat completion: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI service error: {str(e)}"
        )

    asst_msg_record = add_message(conv_id, "assistant", full_content)
    return ChatNonStreamResponse(
        conversation_id=conv_id,
        title=auto_title,
        message=MessageResponse(
            id=asst_msg_record["id"],
            conversation_id=conv_id,
            role="assistant",
            content=asst_msg_record["content"],
            created_at=asst_msg_record["created_at"]
        )
    )


# ==============================================================================
# Static Files & Frontend Serving
# ==============================================================================

FRONTEND_DIR = BASE_DIR / "frontend"

if FRONTEND_DIR.exists():
    # Mount static assets for frontend (HTML, CSS, JS)
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
else:
    logger.warning("Frontend directory not found at: %s", FRONTEND_DIR)
