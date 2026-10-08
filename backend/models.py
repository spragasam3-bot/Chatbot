"""
Pydantic Request & Response Data Models
=======================================

EDUCATIONAL CONCEPTS FOR STUDENTS:
-----------------------------------
1. What is Pydantic?
   Pydantic is Python's leading data validation library. When a client sends a JSON
   payload in an HTTP request, FastAPI uses Pydantic to automatically parse, coerce,
   and validate the data against type hints before your endpoint logic ever executes.

2. Why Request Validation Matters (Security & Reliability):
   Without validation, malicious or malformed inputs (such as infinite strings or
   missing fields) can crash your backend server or exhaust system memory.
   By constraining string lengths and field formats, we maintain application safety.
"""

from typing import Literal, Optional
from pydantic import BaseModel, Field


RoleType = Literal["user", "assistant", "system"]


class MessageBase(BaseModel):
    """Base schema for a single chat message."""
    role: RoleType = Field(..., description="Role of the author: 'user', 'assistant', or 'system'")
    content: str = Field(..., min_length=1, max_length=32000, description="Text content of the message")


class MessageCreate(MessageBase):
    """Payload to append a new message manually."""
    pass


class MessageResponse(MessageBase):
    """Full message representation including persistence identifiers and timestamps."""
    id: str
    conversation_id: str
    created_at: str


class ConversationBase(BaseModel):
    """Base conversation representation."""
    title: str = Field(default="New Chat", max_length=100)


class ConversationCreate(BaseModel):
    """Payload to create an empty conversation."""
    title: Optional[str] = Field(default="New Chat", max_length=100)


class ConversationResponse(BaseModel):
    """Summary of a conversation for list displays in the sidebar."""
    id: str
    title: str
    created_at: str
    updated_at: str
    message_count: int = 0


class ConversationDetailResponse(BaseModel):
    """Complete conversation view including message history."""
    id: str
    title: str
    created_at: str
    updated_at: str
    messages: list[MessageResponse]


class ChatRequest(BaseModel):
    """
    Primary chat request payload sent from the frontend client.
    Can be used for either streaming (SSE) or single-shot response.
    """
    conversation_id: Optional[str] = Field(
        default=None,
        description="ID of existing conversation. If omitted, a new conversation will be created."
    )
    message: str = Field(
        ...,
        min_length=1,
        max_length=32000,
        description="The user's prompt or question."
    )
    model: Optional[str] = Field(
        default=None,
        description="Specific OpenAI model override (e.g. 'gpt-4o-mini', 'gpt-4o')."
    )
    system_prompt: Optional[str] = Field(
        default=None,
        max_length=4000,
        description="Custom system prompt to guide AI persona/style."
    )
    temperature: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=2.0,
        description="Sampling temperature between 0.0 (focused) and 2.0 (creative)."
    )
    max_tokens: Optional[int] = Field(
        default=None,
        ge=1,
        le=8192,
        description="Maximum tokens the model may generate."
    )
    stream: bool = Field(
        default=True,
        description="If True, stream tokens progressively via Server-Sent Events (SSE)."
    )


class ChatNonStreamResponse(BaseModel):
    """Response returned when stream=False is requested."""
    conversation_id: str
    title: str
    message: MessageResponse


class HealthResponse(BaseModel):
    """System health check and diagnostic status."""
    status: str
    api_key_configured: bool
    default_model: str
    database: str
