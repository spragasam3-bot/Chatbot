# 🤖 Production-Ready Python LLM Chatbot

A clean, production-grade, full-stack AI Chatbot application built with **Python 3.11+**, **FastAPI**, **SQLite**, and the official **OpenAI Python SDK**. 

Designed to deliver a ChatGPT-inspired user experience while keeping the architecture modular, secure, and easily understandable for students and developers learning how modern Large Language Model (LLM) applications work.

---

## 🌟 Key Features

- **Real LLM Integration**: Uses official `AsyncOpenAI` client communicating directly with OpenAI models (`gpt-4o-mini`, `gpt-4o`, `gpt-3.5-turbo`, etc.). No fake responses.
- **Server-Sent Events (SSE) Streaming**: Progressive token-by-token rendering with a blinking cursor, typing indicator, and stop button.
- **Conversation Context Memory**: Remembers prior questions and answers within each chat session using SQLite persistence.
- **ChatGPT-Inspired Dark Theme UI**: Sleek dark interface, responsive drawer on mobile/tablet, smooth animations, and clean cards.
- **Rich Markdown & Code Syntax Highlighting**: Full Markdown parsing (headings, tables, blockquotes, lists) and syntax-highlighted code blocks with a one-click **Copy** button.
- **Smart Chat Management**:
  - Automatic concise conversation title generation on the first user message.
  - Multi-chat sidebar grouped by **Today**, **Yesterday**, **Previous 7 Days**, and **Older**.
  - Delete conversations with confirmation modals.
  - Clear messages in active conversation without losing the session container.
- **Customizable AI Settings**: In-app modal to adjust AI Model, System Prompt (personality), Temperature (creativity), and Max Output Tokens.
- **Enterprise-Grade Security**:
  - API keys are strictly loaded server-side from `.env` and never exposed to client-side code.
  - Fully parameterized SQLite database queries to prevent SQL Injection.
  - XSS protection with `DOMPurify` input sanitization.
  - Request length limiting and Pydantic schema validation.
- **Zero-Config Local Run**: Self-hosted static file serving from FastAPI; starts with a single command: `python run.py`.

---

## 🏗️ System Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                    Web Browser (Frontend)                   │
│   Vanilla HTML5 + Modern CSS3 + Vanilla JS (ES6 Modules)    │
│  - SSE Stream Consumer (fetch ReadableStream + TextDecoder) │
│  - Marked.js + Highlight.js + DOMPurify                     │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / SSE (/api/chat)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                  FastAPI Backend Server                     │
│  - Request Validation (Pydantic models)                     │
│  - Static Asset Provider (Mounts /frontend at /)            │
│  - CORS & Error Handling Middleware                         │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               ▼                              ▼
┌──────────────────────────────┐ ┌────────────────────────────┐
│   Database Layer (SQLite3)   │ │  Chatbot Service (Python)  │
│  - conversations table       │ │  - AsyncOpenAI Client      │
│  - messages table (CASCADE)  │ │  - Context Window Builder  │
│  - Parameterized Queries     │ │  - Error Handler           │
│  - Write-Ahead Logging (WAL) │ │  - Local Title Generator   │
└──────────────────────────────┘ └─────────────┬──────────────┘
                                               │ HTTPS (stream=True)
                                               ▼
                                 ┌────────────────────────────┐
                                 │      OpenAI Cloud API      │
                                 │ (gpt-4o-mini / gpt-4o ...) │
                                 └────────────────────────────┘
```

---

## 📁 Project Directory Structure

```text
Chatbot/
│
├── backend/                        # Python Backend Application
│   ├── __init__.py                 # Backend package initializer
│   ├── main.py                     # FastAPI REST API & SSE streaming endpoints
│   ├── chatbot.py                  # OpenAI API client, streaming, error translation
│   ├── database.py                 # SQLite database helper & parameterized queries
│   ├── models.py                   # Pydantic schemas for request/response validation
│   ├── config.py                   # Environment configuration & settings
│   └── requirements.txt            # Python dependencies
│
├── frontend/                       # Client-Side Application
│   ├── index.html                  # Semantic HTML5 layout & accessible modals
│   ├── style.css                   # ChatGPT-inspired dark design system & responsive layout
│   └── app.js                      # Event handling, SSE stream reader, markdown rendering
│
├── data/                           # Local Data Storage
│   └── chatbot.db                  # SQLite database file (created automatically)
│
├── .env                            # Secret environment variables (never committed)
├── .env.example                    # Template for environment configuration
├── .gitignore                      # Git ignore file for secrets, cache, and db files
├── README.md                       # Comprehensive guide and documentation
└── run.py                          # Single-command launcher script
```

---

## 📋 Requirements

- **Python**: Version `3.11` or higher (`3.11`, `3.12`, `3.13`, `3.14+`)
- **Modern Web Browser**: Chrome, Firefox, Edge, Safari, Brave
- **OpenAI API Key**: Obtain one from [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

---

## 🚀 Quick Setup & Installation

### Step 1: Clone or Navigate to the Project

```bash
cd "c:\Users\Kishor S\OneDrive\Desktop\Chatbot"
```

### Step 2: Create and Activate a Virtual Environment

On **Windows (PowerShell)**:
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

*(If script execution is disabled on your machine, run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` first).*

On **macOS / Linux**:
```bash
python3 -m venv venv
source venv/bin/activate
```

### Step 3: Install Required Dependencies

```bash
python -m pip install -r backend/requirements.txt
```

Only 5 lean dependencies are installed:
- `fastapi`: High-performance async web framework.
- `uvicorn`: Lightning-fast ASGI production web server.
- `openai`: Official OpenAI SDK for model completions.
- `pydantic`: Robust data parsing and validation.
- `python-dotenv`: Secure `.env` file loader.

---

## 🔑 Environment Configuration

1. Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

2. Open `.env` and insert your OpenAI API key:

```env
# Your OpenAI Secret Key from platform.openai.com
OPENAI_API_KEY=sk-your-actual-api-key-here

# Selected model (e.g., gpt-4o-mini, gpt-4o, gpt-3.5-turbo)
OPENAI_MODEL=gpt-4o-mini

# Optional: Host and Port
HOST=127.0.0.1
PORT=8000
```

> [!IMPORTANT]
> The `.env` file is excluded in `.gitignore`. Never commit your real API key to any public or private repository.

---

## 🏃 Running the Application

Start the application with one command:

```bash
python run.py
```

You will see the startup banner:

```text
================================================================
          🤖 PRODUCTION-READY AI CHATBOT APPLICATION
================================================================
  • Environment Host:   127.0.0.1
  • Port:               8000
  • Default LLM Model:  gpt-4o-mini
  • API Key Configured: [YES]
  • Database File:      ...\data\chatbot.db
----------------------------------------------------------------
  🚀 Server running at: http://127.0.0.1:8000
  🌐 Open browser to:   http://localhost:8000
  📖 API Documentation: http://127.0.0.1:8000/docs
================================================================
```

Now open **[http://localhost:8000](http://localhost:8000)** in your browser!

---

## 💡 How to Use the Chatbot

1. **New Chat**:
   - Click the **+ New Chat** button in the sidebar (or press `Ctrl + K` / `Cmd + K`).
   - The greeting screen offers sample prompt chips you can click immediately.
2. **Sending Messages**:
   - Type your question in the text box.
   - Press <kbd>Enter</kbd> to send.
   - Press <kbd>Shift</kbd> + <kbd>Enter</kbd> to insert a new line.
3. **Canceling Mid-Stream**:
   - While the AI is generating, the send button switches to a red **Stop** button. Click it to immediately halt streaming.
4. **Conversation Context Memory**:
   - Ask: `"My favorite programming language is Python."`
   - Next prompt: `"What is my favorite programming language?"`
   - The AI reads previous history and correctly answers `"Python"`.
5. **Managing Chats**:
   - Hover over any conversation in the sidebar and click the trash can icon to delete it.
   - Click the trash icon in the top header to clear all messages from the active conversation.
6. **Adjusting Settings**:
   - Click the **⚙ Settings** button in the sidebar or header.
   - Change the AI model, system prompt, temperature (0.0 to 1.5), or maximum response tokens. Preferences are saved automatically in your browser's `localStorage`.

---

## 🔍 Request Lifecycle Trace: Sending "Hello"

Here is step-by-step what happens under the hood when a user types `"Hello"` and presses <kbd>Enter</kbd>:

```text
[1] User types "Hello" into the browser textarea and presses Enter
      ↓
[2] frontend/app.js intercepts the event, renders the User message card in the UI,
    and initiates an HTTP POST request to /api/chat with stream: true
      ↓
[3] backend/main.py receives the HTTP request and Pydantic validates the payload
      ↓
[4] backend/database.py retrieves prior chat history (if any) from SQLite,
    generates a title ("Hello"), and commits the user's message to the messages table
      ↓
[5] backend/chatbot.py compiles the prompt array:
    [
      {"role": "system", "content": "You are a helpful AI assistant..."},
      ...prior messages...,
      {"role": "user", "content": "Hello"}
    ]
      ↓
[6] AsyncOpenAI client opens an HTTPS streaming request to OpenAI API
      ↓
[7] OpenAI's transformer model processes the prompt and generates response tokens
      ↓
[8] Tokens arrive at FastAPI, which yields them via Server-Sent Events (SSE):
    data: {"type": "chunk", "delta": "Hello"}\n\n
    data: {"type": "chunk", "delta": "! How"}\n\n
    data: {"type": "chunk", "delta": " can I help you today?"}\n\n
      ↓
[9] frontend/app.js receives each SSE chunk, updates the DOM, triggers Marked.js,
    and highlights code blocks dynamically with Highlight.js
      ↓
[10] Once stream ends, backend commits the full assistant response to SQLite
     and sends an 'end' event. The conversation is saved for future sessions!
```

---

## 🎓 Educational Guide for Students

### 1. What is an LLM?
A **Large Language Model (LLM)** is a statistical neural network (specifically a Transformer) trained on billions of sentences to calculate the probability of what words should appear next. It does not search Google or "think" in human terms; it predicts the most coherent subsequent token based on patterns learned during training.

### 2. What is Python doing?
Python serves as the **application and orchestration backend**. Since an LLM is a remote service, Python:
- Validates user input to prevent abuse.
- Manages the SQLite database to store chat history.
- Keeps secret API credentials safe on the server (never exposing them to JavaScript).
- Formats message history into the schema expected by the AI provider.

### 3. What is an API?
An **API (Application Programming Interface)** is a standardized protocol allowing two software applications to exchange information. Here, FastAPI acts as an API server providing endpoints (`/api/chat`, `/api/conversations`) for the browser, while also acting as an API client calling OpenAI's cloud API.

### 4. What is a Token?
LLMs do not read whole words or characters directly; they process **tokens**—chunks of text typically 3–4 characters long (e.g., `"learning"` might be split into `["learn", "ing"]`). Token counts matter because:
- Context windows are limited (e.g., 128k tokens).
- Costs are calculated per 1,000 or 1,000,000 tokens.

### 5. What is Conversation Context (Memory)?
Because LLM APIs are **stateless** (the API server completely forgets your conversation as soon as an HTTP request finishes), our backend creates the illusion of memory by retrieving the transcript from SQLite and prepending previous messages into every new request.

### 6. What is Streaming (Server-Sent Events)?
Without streaming, you would have to wait 5–15 seconds while the entire paragraph is generated before seeing any output. With streaming, OpenAI delivers tokens as soon as they are computed. Our backend streams them to the browser using **Server-Sent Events (SSE)**, creating the responsive "typing" effect.

---

## 🔌 API Endpoint Documentation

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | System health check and API key readiness verification |
| `GET` | `/api/models` | List of curated models and system prompt defaults |
| `GET` | `/api/conversations` | List all conversations ordered by recent activity |
| `POST` | `/api/conversations` | Create a new blank conversation |
| `GET` | `/api/conversations/{id}` | Get conversation metadata and full message history |
| `DELETE` | `/api/conversations/{id}` | Permanently delete a conversation and its messages |
| `POST` | `/api/conversations/{id}/clear` | Clear all messages from conversation |
| `POST` | `/api/conversations/{id}/messages` | Manually append a message to conversation |
| `POST` | `/api/chat` | Main completion endpoint (supports SSE streaming) |

Interactive Swagger documentation is available at **`/docs`** when the server is running.

---

## 🛡️ Security Features

- **No Client-Side Secrets**: `OPENAI_API_KEY` is strictly accessed in Python (`backend/config.py`).
- **SQL Injection Prevention**: 100% of database queries use SQLite parameterized placeholders (`?`).
- **XSS Protection**: User and AI text is rendered through `DOMPurify` before insertion into the DOM.
- **Input Bounds**: Pydantic limits user prompt length to 32,000 characters to prevent buffer overflow attacks.

---

## ⚠️ Known Limitations & Future Enhancements

- **Local SQLite Single-File**: SQLite handles hundreds of concurrent local reads with WAL mode enabled. For large-scale distributed deployments across multiple servers, migrate to PostgreSQL.
- **Context Window Management**: Currently sends all messages in the conversation. For very long chats (100+ turns), implementing sliding-window summarization or token-budget pruning is recommended.
- **Document & Image Uploads**: Currently focused on text completions. Can be extended with multimodal inputs (`gpt-4o` vision) and PDF document parsing.

---

## 📄 License

This project is open-source under the MIT License. Feel free to use, modify, and distribute for educational or commercial purposes.
