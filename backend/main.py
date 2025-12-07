from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, validator
from typing import List, Optional, Dict, Set, Any
import uvicorn
from pathlib import Path
import secrets
import time
import qrcode
import io
import re
import json
from datetime import datetime, timedelta
from functools import lru_cache
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

app = FastAPI(
    title="Gov API",
    description="API dla frontendu i aplikacji mobilnej",
    version="1.0.0"
)

# Funkcja do pobierania adresu IP - działa w serverless (Railway/Vercel)
def get_client_ip(request: Request) -> str:
    """Pobiera adres IP klienta, obsługując X-Forwarded-For dla serverless"""
    # Sprawdź X-Forwarded-For (używany przez Railway/Vercel)
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # X-Forwarded-For może zawierać wiele IP, weź pierwsze
        return forwarded_for.split(",")[0].strip()
    
    # Sprawdź X-Real-IP (alternatywny header)
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    
    # Fallback do standardowej metody
    if request.client:
        return request.client.host
    
    # Ostateczny fallback
    return "unknown"

# Rate Limiting - ochrona przed nadużyciami
limiter = Limiter(key_func=get_client_ip)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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
# W produkcji użyj zbudowanych plików z Vite, w dev użyj źródłowych
DIST_DIR = BASE_DIR / "dist"
FRONTEND_DIR = DIST_DIR if DIST_DIR.exists() else BASE_DIR
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
    nonce: Optional[str] = None  # Jednorazowy kod dla QR
    device_id: Optional[str] = None
    device_name: Optional[str] = None
    
    @validator('token')
    def validate_token(cls, v):
        if v is not None:
            # Walidacja formatu tokenu - tylko bezpieczne znaki
            if not re.match(r'^[A-Za-z0-9_-]+$', v) or len(v) < 16:
                raise ValueError('Invalid token format')
        return v
    
    @validator('pin')
    def validate_pin(cls, v):
        if v is not None:
            # PIN musi być dokładnie 6 cyfr
            if not re.match(r'^\d{6}$', v):
                raise ValueError('PIN must be exactly 6 digits')
        return v
    
    @validator('nonce')
    def validate_nonce(cls, v):
        if v is not None:
            # Nonce - bezpieczne znaki alfanumeryczne
            if not re.match(r'^[A-Za-z0-9_-]+$', v) or len(v) < 8:
                raise ValueError('Invalid nonce format')
        return v
    
    @validator('device_id', 'device_name')
    def validate_device_info(cls, v):
        if v is not None:
            # Ochrona przed injection - maksymalna długość
            if len(v) > 200:
                raise ValueError('Device info too long')
            # Usuń potencjalnie niebezpieczne znaki
            v = re.sub(r'[<>"\']', '', v)
        return v

# Przykładowa baza danych w pamięci (w produkcji użyj prawdziwej bazy danych)
items_db = []
next_id = 1

# System parowania QR code
pairing_sessions: Dict[str, dict] = {}  # token -> session data
pin_to_token: Dict[str, str] = {}  # pin -> token
PAIRING_TIMEOUT_SECONDS = 300  # 5 minut

# System weryfikacji domen .gov.pl
GOV_DOMAINS_CACHE: Optional[Dict[str, Any]] = None
GOV_DOMAINS_SET: Optional[Set[str]] = None
GOV_DOMAINS_LAST_LOADED: Optional[float] = None
GOV_DOMAINS_CACHE_TTL = 3600  # 1 godzina

def load_gov_domains() -> Dict[str, Any]:
    """Ładuje domeny z pliku gov.json i zwraca przetworzoną strukturę"""
    global GOV_DOMAINS_CACHE, GOV_DOMAINS_SET, GOV_DOMAINS_LAST_LOADED
    
    current_time = time.time()
    
    # Sprawdź cache
    if (GOV_DOMAINS_CACHE is not None and 
        GOV_DOMAINS_LAST_LOADED is not None and
        current_time - GOV_DOMAINS_LAST_LOADED < GOV_DOMAINS_CACHE_TTL):
        return GOV_DOMAINS_CACHE
    
    gov_json_path = ASSETS_DIR / "gov.json"
    if not gov_json_path.exists():
        # Fallback - zwróć pustą strukturę
        empty_structure = {
            "domains": [],
            "categories": {},
            "total": 0,
            "last_updated": None
        }
        GOV_DOMAINS_CACHE = empty_structure
        GOV_DOMAINS_SET = set()
        GOV_DOMAINS_LAST_LOADED = current_time
        return empty_structure
    
    try:
        with open(gov_json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        domains = []
        domains_set = set()
        categories = {
            "ministerstwa": [],
            "urzedy": [],
            "serwisy": [],
            "inne": []
        }
        
        # Parsuj domeny z struktury JSON API
        for item in data.get("data", []):
            domain = item.get("attributes", {}).get("col1", {}).get("val")
            if domain and isinstance(domain, str) and domain.endswith(".gov.pl"):
                domain_lower = domain.lower().strip()
                if domain_lower:
                    domains.append(domain_lower)
                    domains_set.add(domain_lower)
                    
                    # Kategoryzacja na podstawie domeny
                    if any(keyword in domain_lower for keyword in ["ministerstwo", "msp", "mk", "mz", "msw", "mkidn"]):
                        categories["ministerstwa"].append(domain_lower)
                    elif any(keyword in domain_lower for keyword in [".sr.", ".uw.", ".um.", ".gmina"]):
                        categories["urzedy"].append(domain_lower)
                    elif any(keyword in domain_lower for keyword in ["epuap", "obywatel", "pacjent", "edukacja"]):
                        categories["serwisy"].append(domain_lower)
                    else:
                        categories["inne"].append(domain_lower)
        
        # Sortuj alfabetycznie
        domains.sort()
        for category in categories.values():
            category.sort()
        
        structure = {
            "domains": domains,
            "categories": categories,
            "total": len(domains),
            "last_updated": data.get("meta", {}).get("server_time")
        }
        
        GOV_DOMAINS_CACHE = structure
        GOV_DOMAINS_SET = domains_set
        GOV_DOMAINS_LAST_LOADED = current_time
        
        return structure
    except Exception as e:
        print(f"Błąd podczas ładowania domen z gov.json: {e}")
        empty_structure = {
            "domains": [],
            "categories": {},
            "total": 0,
            "last_updated": None
        }
        GOV_DOMAINS_CACHE = empty_structure
        GOV_DOMAINS_SET = set()
        GOV_DOMAINS_LAST_LOADED = current_time
        return empty_structure

def normalize_domain(domain: str) -> str:
    """Normalizuje domenę do małych liter i usuwa białe znaki"""
    if not domain:
        return ""
    # Usuń protokół jeśli jest
    domain = re.sub(r'^https?://', '', domain)
    # Usuń www. jeśli jest
    domain = re.sub(r'^www\.', '', domain)
    # Usuń ścieżkę i parametry
    domain = domain.split('/')[0].split('?')[0].split('#')[0]
    # Normalizuj do małych liter i usuń białe znaki
    return domain.lower().strip()

def is_official_gov_domain(domain: str) -> bool:
    """Sprawdza czy domena jest oficjalną domeną .gov.pl"""
    global GOV_DOMAINS_SET
    normalized = normalize_domain(domain)
    if not normalized.endswith(".gov.pl"):
        return False
    
    # Załaduj domeny (ustawi też GOV_DOMAINS_SET)
    load_gov_domains()
    return normalized in (GOV_DOMAINS_SET or set())

# Endpointy weryfikacji domen
@app.get("/api/domain/verify")
@limiter.limit("60/minute")  # Rate limiting
async def verify_domain(request: Request, domain: Optional[str] = Query(None)):
    """Weryfikuje czy domena jest oficjalną domeną .gov.pl"""
    # Jeśli domena nie jest podana, spróbuj użyć hostname z requestu
    if not domain:
        # Spróbuj pobrać z nagłówka Host
        host = request.headers.get("Host", "")
        if host:
            domain = host.split(":")[0]  # Usuń port jeśli jest
    
    if not domain:
        raise HTTPException(
            status_code=400, 
            detail="Domain parameter is required. Provide ?domain=example.gov.pl or use Host header"
        )
    
    normalized = normalize_domain(domain)
    is_official = is_official_gov_domain(normalized)
    
    domains_data = load_gov_domains()
    
    # Określ kategorię domeny
    category = None
    for cat_name, cat_domains in domains_data["categories"].items():
        if normalized in cat_domains:
            category = cat_name
            break
    
    return {
        "domain": normalized,
        "is_official": is_official,
        "status": "verified" if is_official else "unverified",
        "category": category,
        "trust_score": 100 if is_official else 0,
        "message": "Domena jest oficjalną domeną .gov.pl" if is_official else "Domena nie została znaleziona na oficjalnej liście domen .gov.pl",
        "last_updated": domains_data.get("last_updated")
    }

@app.get("/api/domains/compendium")
@limiter.limit("30/minute")  # Rate limiting
async def get_domains_compendium(
    request: Request,
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    limit: Optional[int] = Query(100, ge=1, le=1000),
    offset: Optional[int] = Query(0, ge=0)
):
    """Zwraca kompendium wszystkich oficjalnych domen .gov.pl z możliwością wyszukiwania i filtrowania"""
    domains_data = load_gov_domains()
    
    # Pobierz domeny
    all_domains = domains_data["domains"]
    
    # Filtruj po kategorii
    if category and category in domains_data["categories"]:
        filtered_domains = domains_data["categories"][category]
    else:
        filtered_domains = all_domains
    
    # Wyszukiwanie
    if search:
        search_lower = search.lower()
        filtered_domains = [d for d in filtered_domains if search_lower in d.lower()]
    
    # Paginacja
    total = len(filtered_domains)
    paginated_domains = filtered_domains[offset:offset + limit]
    
    return {
        "domains": paginated_domains,
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": offset + limit < total,
        "categories": {
            name: len(domains) for name, domains in domains_data["categories"].items()
        },
        "last_updated": domains_data.get("last_updated"),
        "search": search,
        "category": category
    }

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

@app.get("/compendium", response_class=HTMLResponse)
async def compendium_page():
    """Strona kompendium domen .gov.pl"""
    html_file = FRONTEND_DIR / "compendium.html"
    if html_file.exists():
        with open(html_file, "r", encoding="utf-8") as f:
            return f.read()
    else:
        # Fallback - spróbuj z głównego katalogu
        fallback_file = BASE_DIR / "frontend" / "compendium.html"
        if fallback_file.exists():
            with open(fallback_file, "r", encoding="utf-8") as f:
                return f.read()
        else:
            return HTMLResponse(
                content="<h1>Strona kompendium nie znaleziona</h1><p>Strona jest w trakcie przygotowania.</p>",
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
@limiter.limit("20/minute")  # Maksymalnie 20 requestów na minutę
async def generate_pairing_qr(request: Request):
    """Generuje nowy unikalny kod QR i 6-cyfrowy PIN do parowania (ważny 5 minut)"""
    cleanup_expired_sessions()
    
    # Generuj unikalny token
    token = secrets.token_urlsafe(32)
    # Generuj 6-cyfrowy PIN
    pin = generate_pin()
    # Generuj nonce (jednorazowy kod) dla QR - zapobiega replay attacks
    nonce = secrets.token_urlsafe(16)
    expires_at = time.time() + PAIRING_TIMEOUT_SECONDS
    
    pairing_sessions[token] = {
        "token": token,
        "pin": pin,
        "nonce": nonce,  # Jednorazowy kod
        "nonce_used": False,  # Flaga czy nonce został użyty
        "status": "pending",  # pending, confirmed, expired
        "created_at": time.time(),
        "expires_at": expires_at,
        "confirmed_at": None,
        "device_id": None,
        "device_name": None
    }
    
    # Mapowanie PIN -> token
    pin_to_token[pin] = token
    
    # QR code zawiera token i nonce - aplikacja mobilna musi przesłać oba
    qr_data = f"{token}:{nonce}"
    
    return {
        "token": token,
        "pin": pin,
        "nonce": nonce,  # Nonce jest zwracany, ale nie powinien być w QR (tylko dla testów)
        "qr_data": qr_data,  # QR zawiera token:nonce
        "expires_at": expires_at,
        "expires_in_seconds": PAIRING_TIMEOUT_SECONDS
    }

@app.get("/api/pairing/qr/{token}")
@limiter.limit("30/minute")  # Rate limiting dla QR
async def get_qr_code_image(request: Request, token: str):
    """Zwraca obrazek QR code dla danego tokenu"""
    cleanup_expired_sessions()
    
    # Walidacja tokenu
    if not re.match(r'^[A-Za-z0-9_-]+$', token):
        raise HTTPException(status_code=400, detail="Invalid token format")
    
    if token not in pairing_sessions:
        raise HTTPException(status_code=404, detail="Token not found or expired")
    
    session = pairing_sessions[token]
    if time.time() > session["expires_at"]:
        raise HTTPException(status_code=410, detail="Token expired")
    
    # QR code zawiera token:nonce dla bezpieczeństwa
    qr_data = f"{token}:{session['nonce']}"
    
    # Generuj QR code z kolorami projektu gov.pl
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(qr_data)
    qr.make(fit=True)
    
    # Kolory projektu: niebieski (#0a4d9c) zamiast czarnego, białe tło
    # Używamy RGB tuple zamiast nazw kolorów dla lepszej kontroli
    img = qr.make_image(
        fill_color=(10, 77, 156),  # --blue: #0a4d9c
        back_color=(255, 255, 255)  # białe tło
    )
    
    # Konwertuj do bytes
    img_bytes = io.BytesIO()
    img.save(img_bytes, format='PNG')
    img_bytes.seek(0)
    
    # Zwróć obraz z odpowiednimi nagłówkami CORS
    return Response(
        content=img_bytes.read(), 
        media_type="image/png",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )

@app.get("/api/pairing/status/{token}")
@limiter.limit("60/minute")  # Status można sprawdzać częściej
async def get_pairing_status(request: Request, token: str):
    """Sprawdza status parowania"""
    cleanup_expired_sessions()
    
    # Walidacja tokenu
    if not re.match(r'^[A-Za-z0-9_-]+$', token):
        raise HTTPException(status_code=400, detail="Invalid token format")
    
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
            "message": "Token wygasł",
            "verification_result": {
                "verified": False,
                "message": "Kod weryfikacyjny wygasł. Wygeneruj nowy kod.",
                "severity": "error"
            }
        }
    
    remaining_seconds = int(session["expires_at"] - current_time)
    
    # Przygotuj wynik weryfikacji
    verification_result = None
    if session["status"] == "confirmed":
        verification_result = {
            "verified": True,
            "message": "Strona jest zaufana i zweryfikowana.",
            "severity": "success",
            "device_name": session.get("device_name"),
            "verified_at": session.get("confirmed_at")
        }
    elif session["status"] == "pending":
        verification_result = {
            "verified": False,
            "message": "Oczekiwanie na weryfikację...",
            "severity": "pending"
        }
    
    return {
        "token": token,
        "pin": session.get("pin"),
        "status": session["status"],
        "remaining_seconds": remaining_seconds,
        "device_id": session.get("device_id"),
        "device_name": session.get("device_name"),
        "confirmed_at": session.get("confirmed_at"),
        "verification_result": verification_result
    }

@app.post("/api/pairing/confirm")
@limiter.limit("10/minute")  # Ograniczenie prób potwierdzenia
async def confirm_pairing(request: Request, confirm: PairingConfirm):
    """Endpoint dla aplikacji mobilnej - potwierdza parowanie po zeskanowaniu QR lub wpisaniu PIN"""
    cleanup_expired_sessions()
    
    # Znajdź token - może być podany bezpośrednio lub przez PIN
    token = None
    if confirm.token:
        token = confirm.token
    elif confirm.pin:
        if confirm.pin not in pin_to_token:
            raise HTTPException(
                status_code=404, 
                detail="PIN not found or expired",
                headers={"X-Verification-Result": "error"}
            )
        token = pin_to_token[confirm.pin]
    else:
        raise HTTPException(
            status_code=400, 
            detail="Either token or pin must be provided",
            headers={"X-Verification-Result": "error"}
        )
    
    if token not in pairing_sessions:
        raise HTTPException(
            status_code=404, 
            detail="Token not found or expired",
            headers={"X-Verification-Result": "error"}
        )
    
    session = pairing_sessions[token]
    current_time = time.time()
    
    if current_time > session["expires_at"]:
        session["status"] = "expired"
        raise HTTPException(
            status_code=410, 
            detail="Token expired",
            headers={"X-Verification-Result": "expired"}
        )
    
    if session["status"] == "confirmed":
        raise HTTPException(
            status_code=400, 
            detail="Pairing already confirmed",
            headers={"X-Verification-Result": "already_confirmed"}
        )
    
    # WALIDACJA NONCE - ochrona przed replay attacks
    if confirm.token and confirm.nonce:
        # Jeśli użyto QR code (token + nonce), sprawdź nonce
        if session.get("nonce_used", False):
            raise HTTPException(
                status_code=400,
                detail="Nonce already used - this QR code was already scanned",
                headers={"X-Verification-Result": "nonce_used"}
            )
        
        if session.get("nonce") != confirm.nonce:
            raise HTTPException(
                status_code=400,
                detail="Invalid nonce - QR code may be invalid or tampered",
                headers={"X-Verification-Result": "invalid_nonce"}
            )
        
        # Oznacz nonce jako użyty
        session["nonce_used"] = True
    
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
        "confirmed_at": current_time,
        "verification_result": {
            "verified": True,
            "message": "Strona jest zaufana i zweryfikowana",
            "severity": "success",
            "instructions": [
                "Możesz bezpiecznie korzystać z tej strony",
                "Sprawdź adres URL - powinien kończyć się na .gov.pl",
                "Zwróć uwagę na certyfikat SSL (🔒 w pasku adresu)"
            ]
        }
    }

# Serwowanie plików statycznych - na końcu, żeby nie kolidowały z endpointami API
if FRONTEND_DIR.exists():
    # Serwuj pliki statyczne z dist/ (Vite build) lub z głównego katalogu (dev)
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")
    # Główny plik HTML
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR / "assets")), name="assets") if (FRONTEND_DIR / "assets").exists() else None
if ASSETS_DIR.exists() and not (FRONTEND_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets_original")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)

