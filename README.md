# Gov Project

Projekt zawierający frontend, backend w Pythonie i API dostępne dla frontendu i aplikacji mobilnej.

## Struktura projektu

```
gov/
├── backend/          # Backend w Pythonie (FastAPI)
│   ├── main.py      # Główny plik aplikacji
│   └── requirements.txt
├── frontend/        # Frontend (HTML/CSS/JS)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── mobile/          # Aplikacja mobilna Flutter
│   ├── lib/
│   │   ├── main.dart
│   │   ├── screens/
│   │   ├── services/
│   │   └── widgets/
│   └── pubspec.yaml
├── assets/          # Zasoby (obrazy, ikony, itp.)
└── README.md
```

## Instalacja i uruchomienie

### Backend (Python)

1. Zainstaluj zależności:
```bash
cd backend
pip install -r requirements.txt
```

2. Uruchom serwer:
```bash
python main.py
```

Backend będzie dostępny na: `http://localhost:8000`

3. Dokumentacja API (automatyczna):
   - Swagger UI: `http://localhost:8000/docs`
   - ReDoc: `http://localhost:8000/redoc`

### Frontend

Frontend jest serwowany przez backend. Po uruchomieniu backendu:

1. Otwórz w przeglądarce: `http://localhost:8000/list`

Frontend jest automatycznie dostępny przez backend na porcie 8000.

### Aplikacja mobilna (Flutter)

1. Przejdź do katalogu aplikacji:
```bash
cd mobile
```

2. Zainstaluj zależności:
```bash
flutter pub get
```

3. Skonfiguruj adres API w `lib/services/api_service.dart`:
   - Emulator Android: `http://10.0.2.2:8000`
   - Emulator iOS: `http://localhost:8000`
   - Prawdziwe urządzenie: `http://192.168.1.X:8000` (IP komputera)

4. Uruchom aplikację:
```bash
flutter run
```

Więcej informacji w [mobile/README.md](mobile/README.md)

## API Endpoints

### Podstawowe
- `GET /` - Informacje o API
- `GET /health` - Sprawdzenie stanu API

### Items (CRUD)
- `GET /api/items` - Pobierz wszystkie elementy
- `GET /api/items/{id}` - Pobierz konkretny element
- `POST /api/items` - Utwórz nowy element
- `PUT /api/items/{id}` - Zaktualizuj element
- `DELETE /api/items/{id}` - Usuń element

### Parowanie QR Code i PIN (dla aplikacji mobilnej)
- `POST /api/pairing/generate` - Generuje nowy unikalny kod QR i 6-cyfrowy PIN (ważny 5 minut)
- `GET /api/pairing/qr/{token}` - Zwraca obrazek QR code dla tokenu
- `GET /api/pairing/status/{token}` - Sprawdza status parowania (pending/confirmed/expired)
- `POST /api/pairing/confirm` - Potwierdza parowanie z aplikacji mobilnej (użyj `token` z QR lub `pin`)

### Przykładowe żądania

**Utworzenie elementu:**
```bash
curl -X POST "http://localhost:8000/api/items" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test", "description": "Opis testowy"}'
```

**Pobranie wszystkich elementów:**
```bash
curl "http://localhost:8000/api/items"
```

## System parowania QR Code

System umożliwia parowanie aplikacji mobilnej ze stroną internetową poprzez kod QR.

### Jak to działa:

1. **Użytkownik klika przycisk CTA** na stronie internetowej (`http://localhost:8000/list`)
2. **Generuje się unikalny kod QR i 6-cyfrowy kod PIN** ważny przez 5 minut
3. **Aplikacja mobilna może:**
   - **Zeskanować kod QR** - otrzymuje token
   - **LUB wpisać 6-cyfrowy kod PIN** - aplikacja używa PIN do parowania
4. **Aplikacja mobilna wysyła potwierdzenie** do API z tokenem (z QR) lub PIN
5. **Strona internetowa automatycznie wykrywa** potwierdzenie i wyświetla komunikat sukcesu

### Flow dla aplikacji mobilnej:

**Opcja 1: Skanowanie QR code**
```javascript
// 1. Użytkownik skanuje QR code - otrzymuje token
const token = "token_z_qr_code";

// 2. Wyślij potwierdzenie parowania
const response = await fetch('http://localhost:8000/api/pairing/confirm', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    token: token,  // użyj token z QR code
    device_id: "unique_device_id",  // opcjonalne
    device_name: "iPhone 15"        // opcjonalne
  })
});
```

**Opcja 2: Wpisanie 6-cyfrowego kodu PIN**
```javascript
// 1. Użytkownik wpisuje 6-cyfrowy kod PIN (np. "123456")
const pin = "123456";

// 2. Wyślij potwierdzenie parowania
const response = await fetch('http://localhost:8000/api/pairing/confirm', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    pin: pin,  // użyj PIN zamiast token
    device_id: "unique_device_id",  // opcjonalne
    device_name: "iPhone 15"        // opcjonalne
  })
});
```

### Przykład użycia w aplikacji mobilnej:

**React Native / Flutter / Native:**
- Base URL: `http://localhost:8000` (lub adres serwera produkcyjnego)
- **Opcja 1:** Użyj biblioteki do skanowania QR (np. `react-native-qrcode-scanner`, `qr_code_scanner` w Flutter)
- **Opcja 2:** Pozwól użytkownikowi wpisać 6-cyfrowy kod PIN wyświetlony na stronie
- Po zeskanowaniu QR lub wpisaniu PIN wyślij POST do `/api/pairing/confirm` z tokenem lub PIN

**Przykłady z curl:**

```bash
# Potwierdź parowanie używając tokenu z QR code
curl -X POST "http://localhost:8000/api/pairing/confirm" \
  -H "Content-Type: application/json" \
  -d '{"token": "YOUR_TOKEN_HERE", "device_id": "device123", "device_name": "Test Device"}'

# Potwierdź parowanie używając 6-cyfrowego PIN
curl -X POST "http://localhost:8000/api/pairing/confirm" \
  -H "Content-Type: application/json" \
  -d '{"pin": "123456", "device_id": "device123", "device_name": "Test Device"}'
```

**Uwaga:** Możesz użyć **albo** `token` **albo** `pin` w żądaniu - nie oba jednocześnie.

## Użycie z aplikacji mobilnej

API jest gotowe do użycia z aplikacji mobilnej. Wszystkie endpoints są dostępne przez HTTP/HTTPS i zwracają dane w formacie JSON.

Przykład użycia w aplikacji mobilnej (React Native / Flutter / Native):
- Base URL: `http://localhost:8000` (lub adres serwera produkcyjnego)
- Wszystkie endpoints wymagają nagłówka `Content-Type: application/json`
- Odpowiedzi są w formacie JSON

## CORS

Backend jest skonfigurowany z CORS, aby umożliwić żądania z:
- Frontendu (dowolna domena)
- Aplikacji mobilnej

**Uwaga:** W produkcji zmień `allow_origins=["*"]` na konkretne domeny w pliku `backend/main.py`.

## Rozwój

### Dodawanie nowych endpointów

Edytuj plik `backend/main.py` i dodaj nowe funkcje z dekoratorami `@app.get()`, `@app.post()`, itp.

### Modyfikacja frontendu

Edytuj pliki w katalogu `frontend/`:
- `index.html` - struktura HTML
- `styles.css` - style CSS
- `app.js` - logika JavaScript i komunikacja z API

## Produkcja

Przed wdrożeniem na produkcję:

1. Zmień `allow_origins` w CORS na konkretne domeny
2. Użyj prawdziwej bazy danych zamiast listy w pamięci
3. Dodaj autentykację i autoryzację
4. Skonfiguruj HTTPS
5. Dodaj logowanie i monitoring
6. Skonfiguruj zmienne środowiskowe dla konfiguracji

