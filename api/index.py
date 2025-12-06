"""
Vercel serverless function wrapper for FastAPI
"""
from mangum import Mangum
import sys
from pathlib import Path

# Dodaj katalog główny projektu do ścieżki Python
project_root = Path(__file__).parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

# Import FastAPI app z backend/main.py
from backend.main import app

# Handler dla Vercel - Mangum konwertuje ASGI (FastAPI) do AWS Lambda/Vercel
handler = Mangum(app, lifespan="off")
