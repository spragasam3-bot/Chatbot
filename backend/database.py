"""
Database Persistence Layer (SQLite)
====================================

EDUCATIONAL CONCEPTS FOR STUDENTS:
-----------------------------------
1. Why SQLite?
   SQLite is a serverless, self-contained, ACID-compliant relational SQL database
   engine built directly into Python's standard library. It requires zero external daemon
   setup and stores everything in a single portable `.db` file in `data/chatbot.db`.

2. Security: Parameterized Queries:
   Never use string formatting (e.g. f"SELECT ... WHERE id = '{user_input}'") because it
   leaves your application vulnerable to SQL Injection attacks. Instead, always use
   parameterized placeholders (e.g. `?` in SQLite) which guarantees user inputs are
   treated strictly as data literals, never executable SQL commands.

3. Foreign Keys & Cascading Deletions:
   By enabling `PRAGMA foreign_keys = ON`, whenever a conversation is deleted,
   all associated messages are automatically pruned from the database by SQLite,
   preventing orphaned records.
"""

import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any
from backend.config import settings


def get_connection() -> sqlite3.Connection:
    """
    Open and configure a connection to the SQLite database.
    Enables WAL mode for concurrent reading/writing and activates foreign keys.
    """
    conn = sqlite3.connect(
        settings.DATABASE_PATH,
        check_same_thread=False,
        timeout=15.0
    )
    # Return dictionary-like rows instead of plain tuples
    conn.row_factory = sqlite3.Row
    # Enable Write-Ahead Logging for high-performance concurrent access
    conn.execute("PRAGMA journal_mode = WAL;")
    # Ensure foreign keys are strictly enforced
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_db() -> None:
    """Initialize SQLite schema if tables do not already exist."""
    conn = get_connection()
    try:
        with conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL,
                    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_messages_conversation_id 
                ON messages(conversation_id);

                CREATE INDEX IF NOT EXISTS idx_conversations_updated_at 
                ON conversations(updated_at DESC);
            """)
    finally:
        conn.close()


def utc_now_iso() -> str:
    """Return the current timestamp in ISO 8601 format."""
    return datetime.now(timezone.utc).isoformat()


def create_conversation(title: str = "New Chat") -> str:
    """Create a new conversation record and return its unique ID."""
    conv_id = str(uuid.uuid4())
    now = utc_now_iso()
    conn = get_connection()
    try:
        with conn:
            conn.execute(
                """
                INSERT INTO conversations (id, title, created_at, updated_at)
                VALUES (?, ?, ?, ?)
                """,
                (conv_id, title, now, now)
            )
        return conv_id
    finally:
        conn.close()


def get_all_conversations() -> list[dict[str, Any]]:
    """
    Retrieve all conversations ordered by updated_at descending,
    including the total message count for each.
    """
    conn = get_connection()
    try:
        cursor = conn.execute(
            """
            SELECT 
                c.id, 
                c.title, 
                c.created_at, 
                c.updated_at,
                COUNT(m.id) AS message_count
            FROM conversations c
            LEFT JOIN messages m ON c.id = m.conversation_id
            GROUP BY c.id
            ORDER BY c.updated_at DESC
            """
        )
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


def get_conversation(conversation_id: str) -> dict[str, Any] | None:
    """Fetch metadata for a single conversation by ID."""
    conn = get_connection()
    try:
        cursor = conn.execute(
            """
            SELECT id, title, created_at, updated_at
            FROM conversations
            WHERE id = ?
            """,
            (conversation_id,)
        )
        row = cursor.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def update_conversation_title(conversation_id: str, title: str) -> bool:
    """Update conversation title and refresh the updated_at timestamp."""
    now = utc_now_iso()
    conn = get_connection()
    try:
        with conn:
            cursor = conn.execute(
                """
                UPDATE conversations
                SET title = ?, updated_at = ?
                WHERE id = ?
                """,
                (title, now, conversation_id)
            )
            return cursor.rowcount > 0
    finally:
        conn.close()


def touch_conversation(conversation_id: str) -> None:
    """Update the updated_at timestamp of a conversation without changing title."""
    now = utc_now_iso()
    conn = get_connection()
    try:
        with conn:
            conn.execute(
                """
                UPDATE conversations
                SET updated_at = ?
                WHERE id = ?
                """,
                (now, conversation_id)
            )
    finally:
        conn.close()


def delete_conversation(conversation_id: str) -> bool:
    """
    Delete a conversation and all its messages (via ON DELETE CASCADE).
    Returns True if a row was deleted, False otherwise.
    """
    conn = get_connection()
    try:
        with conn:
            cursor = conn.execute(
                "DELETE FROM conversations WHERE id = ?",
                (conversation_id,)
            )
            return cursor.rowcount > 0
    finally:
        conn.close()


def clear_conversation_messages(conversation_id: str) -> bool:
    """
    Remove all messages from a conversation while keeping the conversation entity.
    Also resets title back to 'New Chat'.
    """
    now = utc_now_iso()
    conn = get_connection()
    try:
        with conn:
            conn.execute(
                "DELETE FROM messages WHERE conversation_id = ?",
                (conversation_id,)
            )
            cursor = conn.execute(
                """
                UPDATE conversations 
                SET title = 'New Chat', updated_at = ?
                WHERE id = ?
                """,
                (now, conversation_id)
            )
            return cursor.rowcount > 0
    finally:
        conn.close()


def add_message(conversation_id: str, role: str, content: str) -> dict[str, Any]:
    """
    Insert a message into the database and update conversation timestamp.
    Returns the created message dictionary.
    """
    message_id = str(uuid.uuid4())
    now = utc_now_iso()
    conn = get_connection()
    try:
        with conn:
            conn.execute(
                """
                INSERT INTO messages (id, conversation_id, role, content, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (message_id, conversation_id, role, content, now)
            )
            conn.execute(
                """
                UPDATE conversations
                SET updated_at = ?
                WHERE id = ?
                """,
                (now, conversation_id)
            )
        return {
            "id": message_id,
            "conversation_id": conversation_id,
            "role": role,
            "content": content,
            "created_at": now
        }
    finally:
        conn.close()


def get_messages(conversation_id: str) -> list[dict[str, Any]]:
    """Retrieve all messages for a specific conversation in chronological order."""
    conn = get_connection()
    try:
        cursor = conn.execute(
            """
            SELECT id, conversation_id, role, content, created_at
            FROM messages
            WHERE conversation_id = ?
            ORDER BY created_at ASC
            """,
            (conversation_id,)
        )
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()
