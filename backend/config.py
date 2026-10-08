"""
Configuration Module for AI Chatbot
====================================

EDUCATIONAL OVERVIEW FOR STUDENTS:
-----------------------------------
1. What is an API?
   API stands for Application Programming Interface. It defines a formal contract
   of rules and protocols enabling two distinct software programs to communicate.
   In this project, our FastAPI Python backend communicates with OpenAI's cloud servers
   over standard HTTPS requests to access large language models.

2. What is an LLM (Large Language Model)?
   An LLM is a deep neural network trained on vast quantities of text data to predict
   the most probable next token in a sequence. Rather than "thinking" like a human,
   the model uses statistical relationships and transformer attention mechanisms to
   generate coherent, context-aware responses.

3. What is Python's role in this stack?
   Python acts as the application and orchestration backend:
   - Validates incoming user requests from the web browser.
   - Manages SQLite persistence so past conversations survive page refreshes.
   - Keeps secret API credentials safe on the server (never exposed to client browser code).
   - Coordinates prompt formatting, context history pruning, and streaming responses.

4. Security Best Practice: Secret Management:
   The OpenAI API Key is a billing credential. If leaked to client-side JavaScript or committed
   to GitHub, unauthorized parties can incur charges on your account. We load secrets strictly
   into server-side environment variables using `python-dotenv` and keep `.env` in `.gitignore`.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Resolve project paths
# backend/ -> parent is project root
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
ENV_PATH = BASE_DIR / ".env"

# Ensure data directory exists for SQLite storage
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Load environment variables from .env file
load_dotenv(dotenv_path=ENV_PATH)

# ==============================================================================
# Default System Prompt (Configurable AI Personality)
# ==============================================================================
DEFAULT_SYSTEM_PROMPT = """You are a helpful AI assistant.

Give accurate, clear, and useful answers.

When explaining technical concepts:
- Start with a simple explanation.
- Then provide technical details.
- Give examples when useful.
- Use code blocks for code.
- Do not pretend to know something when you are uncertain.

Be concise for simple questions and detailed for complex questions."""


class Settings:
    """Application settings loaded from environment variables."""

    # OpenAI API Configuration
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "").strip()
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()
    OPENAI_BASE_URL: str | None = os.getenv("OPENAI_BASE_URL", "").strip() or None

    # Chatbot Behavior Defaults
    DEFAULT_SYSTEM_PROMPT: str = DEFAULT_SYSTEM_PROMPT
    DEFAULT_TEMPERATURE: float = float(os.getenv("DEFAULT_TEMPERATURE", "0.7"))
    DEFAULT_MAX_TOKENS: int = int(os.getenv("DEFAULT_MAX_TOKENS", "2048"))

    # Database Configuration
    DATABASE_PATH: Path = DATA_DIR / "chatbot.db"

    # Server Configuration
    HOST: str = os.getenv("HOST", "127.0.0.1")
    PORT: int = int(os.getenv("PORT", "8000"))

    @classmethod
    def get_available_models(cls) -> list[dict]:
        """Return available models relevant to the configured endpoint."""
        base_url = cls.get_base_url() or ""
        if "googleapis.com" in base_url:
            return [
                {
                    "id": "gemini-3.5-flash-lite",
                    "name": "Gemini 3.5 Flash Lite (Ultra Fast ⚡)",
                    "description": "Google's lowest latency model with sub-second generation."
                },
                {
                    "id": "gemini-3.5-flash",
                    "name": "Gemini 3.5 Flash (Fast & Capable)",
                    "description": "Google's intelligent, responsive multimodal LLM."
                },
                {
                    "id": "gemini-3.8-flash",
                    "name": "Gemini 3.8 Flash (Flagship)",
                    "description": "Google's latest flagship multimodal model."
                }
            ]
        elif "groq.com" in base_url:
            return [
                {
                    "id": "llama-3.3-70b-versatile",
                    "name": "LLaMA 3.3 70B (Groq Fast)",
                    "description": "High performance open model."
                }
            ]
        else:
            return [
                {
                    "id": "gpt-4o-mini",
                    "name": "GPT-4o Mini (Fast & Intelligent)",
                    "description": "Recommended for daily chat, code, and quick reasoning."
                },
                {
                    "id": "gpt-4o",
                    "name": "GPT-4o (Omni Flagship)",
                    "description": "Most capable model for deep reasoning and complex coding."
                },
                {
                    "id": "gpt-4-turbo",
                    "name": "GPT-4 Turbo",
                    "description": "High-intelligence turbo model with broad knowledge."
                },
                {
                    "id": "gpt-3.5-turbo",
                    "name": "GPT-3.5 Turbo (Legacy)",
                    "description": "Legacy cost-efficient model for simple queries."
                }
            ]

    @property
    def AVAILABLE_MODELS(self) -> list[dict]:
        return self.get_available_models()

    @classmethod
    def reload(cls) -> None:
        """Reload variables from .env file."""
        if ENV_PATH.exists():
            load_dotenv(dotenv_path=ENV_PATH, override=True)

    @classmethod
    def get_api_key(cls) -> str:
        cls.reload()
        return os.getenv("OPENAI_API_KEY", "").strip()

    @property
    def OPENAI_API_KEY(self) -> str:
        return self.get_api_key()

    @classmethod
    def get_model(cls) -> str:
        cls.reload()
        return os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()

    @property
    def OPENAI_MODEL(self) -> str:
        return self.get_model()

    @classmethod
    def get_base_url(cls) -> str | None:
        cls.reload()
        val = os.getenv("OPENAI_BASE_URL", "").strip()
        return val if val else None

    @property
    def OPENAI_BASE_URL(self) -> str | None:
        return self.get_base_url()

    @classmethod
    def is_api_key_configured(cls) -> bool:
        """Check whether a realistic, non-placeholder API key is set."""
        key = cls.get_api_key()
        if not key:
            return False
        lowered = key.lower()
        if any(p in lowered for p in ("your_api_key", "yournewgeminikey", "your_openai_api_key", "placeholder", "sk-...")):
            return False
        return True

    @classmethod
    def validate_api_key_or_raise(cls) -> None:
        """
        Validate that the OpenAI API key is present.
        Raises ValueError with student-friendly guidance if missing.
        """
        if not cls.is_api_key_configured():
            raise ValueError(
                "API Key is not configured yet!\n\n"
                "**How to fix:**\n"
                "1. Open the [`.env`](file:///c:/Users/Kishor%20S/OneDrive/Desktop/Chatbot/.env) file in the project folder.\n"
                "2. Replace `your_api_key_here` with your actual API key.\n"
                "3. Save `.env`. The server will detect your key automatically without restarting!"
            )


# Global settings instance
settings = Settings()
