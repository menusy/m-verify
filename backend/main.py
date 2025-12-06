from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional, Dict
import uvicorn
from pathlib import Path
import secrets
import time
import qrcode
import io
from datetime import datetime, timedelta

app = FastAPI(
    title="Gov API",
    description="API dla frontendu i aplikacji mobilnej",
    version="1.0.0"
)

# CORS - pozwala na żądania z frontendu i aplikacji mobilnej
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # W produkcji ustaw konkretne domeny
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ścieżki do katalogów
BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR  # Frontend jest teraz w głównym katalogu
ASSETS_DIR = BASE_DIR / "assets"

# Modele danych
class Item(BaseModel):
    id: Optional[int] = None
    name: str
    description: Optional[str] = None

class ItemCreate(BaseModel):
    name: str
    description: Optional[str] = None

class PairingConfirm(BaseModel):
    token: Optional[str] = None
    pin: Optional[str] = None
    device_id: Optional[str] = None
    device_name: Optional[str] = None

# Przykładowa baza danych w pamięci (w produkcji użyj prawdziwej bazy danych)
items_db = []
next_id = 1

# System parowania QR code
pairing_sessions: Dict[str, dict] = {}  # token -> session data
pin_to_token: Dict[str, str] = {}  # pin -> token
PAIRING_TIMEOUT_SECONDS = 300  # 5 minut

@app.get("/", response_class=HTMLResponse)
async def root():
    """Endpoint główny - przekierowanie do /list"""
    return await list_page()

@app.get("/list", response_class=HTMLResponse)
async def list_page():
    """Strona frontendu z listą"""
    html_file = FRONTEND_DIR / "index.html"
    if html_file.exists():
        with open(html_file, "r", encoding="utf-8") as f:
            return f.read()
    else:
        return HTMLResponse(
            content="<h1>Frontend nie znaleziony</h1><p>Upewnij się, że plik index.html istnieje w głównym katalogu projektu.</p>",
            status_code=404
        )

@app.get("/api")
async def api_info():
    """Informacje o API"""
    return {
        "message": "Gov API",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "items": "/api/items",
            "docs": "/docs",
            "frontend": "/list"
        }
    }

@app.get("/health")
async def health_check():
    """Sprawdzenie stanu API"""
    return {"status": "healthy", "service": "gov-api"}

# Endpoints dla Items
@app.get("/api/items", response_model=List[Item])
async def get_items():
    """Pobierz wszystkie elementy"""
    return items_db

@app.get("/api/items/{item_id}", response_model=Item)
async def get_item(item_id: int):
    """Pobierz konkretny element"""
    item = next((i for i in items_db if i["id"] == item_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item

@app.post("/api/items", response_model=Item)
async def create_item(item: ItemCreate):
    """Utwórz nowy element"""
    global next_id
    new_item = {
        "id": next_id,
        "name": item.name,
        "description": item.description
    }
    items_db.append(new_item)
    next_id += 1
    return new_item

@app.put("/api/items/{item_id}", response_model=Item)
async def update_item(item_id: int, item: ItemCreate):
    """Zaktualizuj element"""
    item_index = next((i for i, x in enumerate(items_db) if x["id"] == item_id), None)
    if item_index is None:
        raise HTTPException(status_code=404, detail="Item not found")
    
    items_db[item_index] = {
        "id": item_id,
        "name": item.name,
        "description": item.description
    }
    return items_db[item_index]

@app.delete("/api/items/{item_id}")
async def delete_item(item_id: int):
    """Usuń element"""
    item_index = next((i for i, x in enumerate(items_db) if x["id"] == item_id), None)
    if item_index is None:
        raise HTTPException(status_code=404, detail="Item not found")
    
    deleted_item = items_db.pop(item_index)
    return {"message": "Item deleted", "item": deleted_item}

# Endpoints dla parowania QR code
def generate_pin() -> str:
    """Generuje unikalny 6-cyfrowy kod PIN"""
    while True:
        pin = f"{secrets.randbelow(1000000):06d}"  # 000000-999999
        if pin not in pin_to_token:
            return pin

def cleanup_expired_sessions():
    """Usuwa wygasłe sesje parowania"""
    current_time = time.time()
    expired_tokens = [
        token for token, session in pairing_sessions.items()
        if current_time > session["expires_at"]
    ]
    for token in expired_tokens:
        # Usuń również mapowanie PIN -> token
        session = pairing_sessions[token]
        if "pin" in session and session["pin"] in pin_to_token:
            del pin_to_token[session["pin"]]
        del pairing_sessions[token]

@app.post("/api/pairing/generate")
async def generate_pairing_qr():
    """Generuje nowy unikalny kod QR i 6-cyfrowy PIN do parowania (ważny 5 minut)"""
    cleanup_expired_sessions()
    
    # Generuj unikalny token
    token = secrets.token_urlsafe(32)
    # Generuj 6-cyfrowy PIN
    pin = generate_pin()
    expires_at = time.time() + PAIRING_TIMEOUT_SECONDS
    
    pairing_sessions[token] = {
        "token": token,
        "pin": pin,
        "status": "pending",  # pending, confirmed, expired
        "created_at": time.time(),
        "expires_at": expires_at,
        "confirmed_at": None,
        "device_id": None,
        "device_name": None
    }
    
    # Mapowanie PIN -> token
    pin_to_token[pin] = token
    
    # URL który będzie w QR code - aplikacja mobilna go zeskanuje
    qr_data = f"{token}"
    
    return {
        "token": token,
        "pin": pin,
        "qr_data": qr_data,
        "expires_at": expires_at,
        "expires_in_seconds": PAIRING_TIMEOUT_SECONDS
    }

@app.get("/api/pairing/qr/{token}")
async def get_qr_code_image(token: str):
    """Zwraca obrazek QR code dla danego tokenu"""
    cleanup_expired_sessions()
    
    if token not in pairing_sessions:
        raise HTTPException(status_code=404, detail="Token not found or expired")
    
    session = pairing_sessions[token]
    if time.time() > session["expires_at"]:
        raise HTTPException(status_code=410, detail="Token expired")
    
    # Generuj QR code
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(token)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    
    # Konwertuj do bytes
    img_bytes = io.BytesIO()
    img.save(img_bytes, format='PNG')
    img_bytes.seek(0)
    
    return Response(content=img_bytes.read(), media_type="image/png")

@app.get("/api/pairing/status/{token}")
async def get_pairing_status(token: str):
    """Sprawdza status parowania"""
    cleanup_expired_sessions()
    
    if token not in pairing_sessions:
        raise HTTPException(status_code=404, detail="Token not found or expired")
    
    session = pairing_sessions[token]
    current_time = time.time()
    
    if current_time > session["expires_at"]:
        session["status"] = "expired"
        return {
            "token": token,
            "pin": session.get("pin"),
            "status": "expired",
            "message": "Token wygasł"
        }
    
    remaining_seconds = int(session["expires_at"] - current_time)
    
    return {
        "token": token,
        "pin": session.get("pin"),
        "status": session["status"],
        "remaining_seconds": remaining_seconds,
        "device_id": session.get("device_id"),
        "device_name": session.get("device_name"),
        "confirmed_at": session.get("confirmed_at")
    }

@app.post("/api/pairing/confirm")
async def confirm_pairing(confirm: PairingConfirm):
    """Endpoint dla aplikacji mobilnej - potwierdza parowanie po zeskanowaniu QR lub wpisaniu PIN"""
    cleanup_expired_sessions()
    
    # Znajdź token - może być podany bezpośrednio lub przez PIN
    token = None
    if confirm.token:
        token = confirm.token
    elif confirm.pin:
        if confirm.pin not in pin_to_token:
            raise HTTPException(status_code=404, detail="PIN not found or expired")
        token = pin_to_token[confirm.pin]
    else:
        raise HTTPException(status_code=400, detail="Either token or pin must be provided")
    
    if token not in pairing_sessions:
        raise HTTPException(status_code=404, detail="Token not found or expired")
    
    session = pairing_sessions[token]
    current_time = time.time()
    
    if current_time > session["expires_at"]:
        session["status"] = "expired"
        raise HTTPException(status_code=410, detail="Token expired")
    
    if session["status"] == "confirmed":
        raise HTTPException(status_code=400, detail="Pairing already confirmed")
    
    # Potwierdź parowanie
    session["status"] = "confirmed"
    session["confirmed_at"] = current_time
    session["device_id"] = confirm.device_id
    session["device_name"] = confirm.device_name
    
    return {
        "success": True,
        "token": token,
        "pin": session.get("pin"),
        "message": "Pairing confirmed successfully",
        "confirmed_at": current_time
    }

# Serwowanie plików statycznych - na końcu, żeby nie kolidowały z endpointami API
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")
if ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

