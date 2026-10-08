#!/usr/bin/env python3
"""
Application Launcher for AI Chatbot
===================================
Starts the FastAPI application with Uvicorn server.

Usage:
    python run.py
"""

import os
import sys
from pathlib import Path

# Ensure project root is on sys.path
PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Verify Python version requirement (Python 3.11+)
if sys.version_info < (3, 11):
    print("=" * 60)
    print("WARNING: This project is designed for Python 3.11 or higher.")
    print(f"Current version detected: Python {sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")
    print("=" * 60)

# Check for .env file; if missing, offer guidance
ENV_FILE = PROJECT_ROOT / ".env"
ENV_EXAMPLE = PROJECT_ROOT / ".env.example"

if not ENV_FILE.exists():
    if ENV_EXAMPLE.exists():
        print("[SETUP] '.env' not found. Creating from '.env.example'...")
        with open(ENV_EXAMPLE, "r", encoding="utf-8") as src, open(ENV_FILE, "w", encoding="utf-8") as dst:
            dst.write(src.read())
        print("[SETUP] Created '.env'. Remember to add your real OPENAI_API_KEY inside it!")
    else:
        print("[SETUP] '.env' not found. Please create one with your OPENAI_API_KEY.")

# Import configuration and server
try:
    import uvicorn
    from backend.config import settings
except ImportError as err:
    print("\n[ERROR] Missing required dependencies!")
    print(f"Details: {err}")
    print("Please install requirements using:")
    print("    python -m pip install -r backend/requirements.txt\n")
    sys.exit(1)


def main():
    """Start Uvicorn server."""
    host = settings.HOST
    port = settings.PORT

    # Configure stdout/stderr to UTF-8 if supported on Windows
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    print("\n" + "=" * 64)
    print("          [AI CHATBOT] PRODUCTION-READY LLM APPLICATION")
    print("=" * 64)
    print(f"  * Environment Host:   {host}")
    print(f"  * Port:               {port}")
    print(f"  * Default LLM Model:  {settings.OPENAI_MODEL}")
    print(f"  * API Key Configured: {'[YES]' if settings.is_api_key_configured() else '[NO - Placeholder/Missing]'}")
    print(f"  * Database File:      {settings.DATABASE_PATH}")
    print("-" * 64)
    print(f"  -> Server running at: http://{host}:{port}")
    print(f"  -> Open browser to:   http://localhost:{port}")
    print(f"  -> API Documentation: http://{host}:{port}/docs")
    print("=" * 64)
    print("Press Ctrl+C to stop the server.\n")

    uvicorn.run(
        "backend.main:app",
        host=host,
        port=port,
        reload=False,
        log_level="info"
    )


if __name__ == "__main__":
    main()
