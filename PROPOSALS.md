# Propozycje funkcjonalności do dodania - Hackathon mObywatel

## 📋 Priorytetowe funkcjonalności (wymagane w zadaniu)

### 1. ✅ Weryfikacja domeny .gov.pl
**Status:** Do implementacji

**Co dodać:**
- Endpoint API: `GET /api/domain/verify?domain=example.gov.pl`
- Lista oficjalnych domen gov.pl (JSON)
- Sprawdzanie czy domena jest na liście
- Wyświetlanie statusu weryfikacji na stronie

**Implementacja:**
```python
# backend/main.py
OFFICIAL_GOV_DOMAINS = [
    "gov.pl",
    "mobywatel.gov.pl",
    "epuap.gov.pl",
    # ... lista z Discord
]

@app.get("/api/domain/verify")
async def verify_domain(domain: str):
    is_official = any(domain.endswith(d) for d in OFFICIAL_GOV_DOMAINS)
    return {
        "domain": domain,
        "is_official": is_official,
        "status": "verified" if is_official else "unverified"
    }
```

---

### 2. ✅ Moduł informacyjny o bezpieczeństwie
**Status:** Do implementacji

**Co dodać:**
- Wyświetlanie statusu SSL/HTTPS
- Informacja o domenie (.gov.pl)
- Wskaźnik zaufania (trust score)
- Data ostatniej weryfikacji

**UI na stronie:**
```html
<div class="security-info-panel">
  <div class="security-item">
    <span class="icon">🔒</span>
    <span>Połączenie HTTPS: Aktywne</span>
  </div>
  <div class="security-item">
    <span class="icon">✓</span>
    <span>Domena: Zweryfikowana (.gov.pl)</span>
  </div>
  <div class="security-item">
    <span class="icon">⭐</span>
    <span>Wskaźnik zaufania: Wysoki</span>
  </div>
</div>
```

---

### 3. ✅ Link do kompendium stron rządowych
**Status:** Do implementacji

**Co dodać:**
- Strona `/compendium` z listą oficjalnych domen
- Wyszukiwarka domen
- Filtrowanie po kategorii (ministerstwa, urzędy, itp.)
- Link w module bezpieczeństwa

**Implementacja:**
```python
@app.get("/api/domains/compendium")
async def get_official_domains():
    return {
        "domains": OFFICIAL_GOV_DOMAINS,
        "categories": {
            "ministerstwa": [...],
            "urzedy": [...],
            "serwisy": [...]
        }
    }
```

---

### 4. ✅ Ulepszony system QR z nonce (jednorazowe kody)
**Status:** Do implementacji

**Co dodać:**
- Generowanie nonce dla każdego QR
- Walidacja nonce przy potwierdzeniu
- Ochrona przed replay attacks
- Automatyczne wygasanie nonce

**Implementacja:**
```python
# Dodaj nonce do sesji parowania
pairing_sessions[token] = {
    ...
    "nonce": secrets.token_urlsafe(16),  # Jednorazowy kod
    "nonce_used": False,
}

# W confirm_pairing sprawdź nonce
if session["nonce_used"]:
    raise HTTPException(400, "Nonce already used")
session["nonce_used"] = True
```

---

### 5. ✅ Komunikaty weryfikacji (pozytywne i negatywne)
**Status:** Częściowo zaimplementowane (custom alert)

**Co ulepszyć:**
- **Pozytywny scenariusz:**
  - Zielony wskaźnik "Strona jest zaufana"
  - Informacja o domenie i certyfikacie
  - Wskazówki do dalszego korzystania

- **Negatywny scenariusz:**
  - Czerwony wskaźnik "Ostrzeżenie!"
  - Wyraźne ostrzeżenie o potencjalnym zagrożeniu
  - Instrukcje co zrobić (zgłoś, nie podawaj danych, itp.)

**Implementacja w aplikacji mobilnej:**
```dart
// mobile/lib/screens/verification_result_screen.dart
class VerificationResultScreen extends StatelessWidget {
  final bool isVerified;
  final String domain;
  final String? warningMessage;
  
  // Pozytywny: zielony ekran z ✓
  // Negatywny: czerwony ekran z ⚠️ i instrukcjami
}
```

---

## 🔒 Bezpieczeństwo i walidacja

### 6. ✅ Walidacja wejścia i ochrona przed manipulacją
**Status:** Do implementacji

**Co dodać:**
- Rate limiting dla API (np. 10 requestów/minutę)
- Sanityzacja wejścia (token, PIN, domain)
- Walidacja formatu tokenów
- Ochrona przed SQL injection (jeśli będzie baza)
- CSRF protection

**Implementacja:**
```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.post("/api/pairing/confirm")
@limiter.limit("10/minute")
async def confirm_pairing(...):
    # Walidacja tokenu
    if not re.match(r'^[A-Za-z0-9_-]+$', token):
        raise HTTPException(400, "Invalid token format")
```

---

### 7. ✅ Lepsza obsługa błędów
**Status:** Częściowo zaimplementowane

**Co ulepszyć:**
- **Brak połączenia:** Wyraźny komunikat + przycisk "Spróbuj ponownie"
- **Timeout:** Automatyczne ponowienie po 3 sekundach
- **Nieprawidłowy QR:** Komunikat "Kod wygasł lub nieprawidłowy"
- **Błąd serwera:** Komunikat + logowanie błędów

**Implementacja w aplikacji:**
```dart
// Lepsze komunikaty błędów
enum VerificationError {
  noConnection,
  timeout,
  invalidQR,
  serverError,
  expiredCode
}

String getErrorMessage(VerificationError error) {
  switch (error) {
    case VerificationError.noConnection:
      return 'Brak połączenia z internetem.\nSprawdź połączenie i spróbuj ponownie.';
    case VerificationError.timeout:
      return 'Przekroczono limit czasu.\nSpróbuj ponownie.';
    // ...
  }
}
```

---

## 📱 Funkcjonalności dodatkowe (dla lepszej oceny)

### 8. ✅ Historia weryfikacji w aplikacji mobilnej
**Status:** Do implementacji

**Co dodać:**
- Ekran "Historia weryfikacji"
- Lista zweryfikowanych stron (data, domena, status)
- Szczegóły weryfikacji
- Możliwość zgłoszenia podejrzanej strony

**Implementacja:**
```dart
// mobile/lib/screens/verification_history_screen.dart
class VerificationHistoryScreen extends StatefulWidget {
  // Lista weryfikacji z SharedPreferences lub lokalnej bazy
  // Możliwość zgłoszenia podejrzanej strony
}
```

---

### 9. ✅ Zgłaszanie podejrzanych stron
**Status:** Do implementacji

**Co dodać:**
- Przycisk "Zgłoś podejrzaną stronę" w negatywnym scenariuszu
- Formularz zgłoszenia (domena, opis, screenshot)
- Endpoint API do zgłoszeń
- Powiadomienie administratora

---

### 10. ✅ Statystyki weryfikacji
**Status:** Opcjonalne

**Co dodać:**
- Dashboard z statystykami (backend)
- Liczba weryfikacji dziennie
- Najczęściej weryfikowane domeny
- Wykresy (opcjonalnie)

---

## 🎨 UX/UI Improvements

### 11. ✅ Lepsze wskaźniki wizualne
**Status:** Do ulepszenia

**Co dodać:**
- Animacje przy weryfikacji
- Progress bar podczas weryfikacji
- Ikony statusu (✓, ⚠️, ❌)
- Kolory semantyczne (zielony, żółty, czerwony)

---

### 12. ✅ Instrukcje dla użytkownika
**Status:** Do dodania

**Co dodać:**
- Tutorial przy pierwszym uruchomieniu
- Tooltips z wyjaśnieniami
- FAQ sekcja
- Link do pomocy

---

## 📊 Priorytety implementacji

### Wysoki priorytet (wymagane):
1. ✅ Weryfikacja domeny .gov.pl
2. ✅ Moduł informacyjny o bezpieczeństwie
3. ✅ Link do kompendium stron rządowych
4. ✅ Ulepszony system QR z nonce
5. ✅ Komunikaty weryfikacji (pozytywne/negatywne)
6. ✅ Walidacja wejścia i rate limiting

### Średni priorytet (ważne):
7. ✅ Lepsza obsługa błędów
8. ✅ Historia weryfikacji w aplikacji

### Niski priorytet (opcjonalne):
9. ✅ Zgłaszanie podejrzanych stron
10. ✅ Statystyki weryfikacji
11. ✅ Lepsze wskaźniki wizualne
12. ✅ Instrukcje dla użytkownika

---

## 🔧 Techniczne wymagania do spełnienia

- ✅ Szyfrowana komunikacja (HTTPS) - już mamy
- ✅ Moduł lekki, niewpływający na wydajność - optymalizacja potrzebna
- ✅ Weryfikacja QR z nonce - do dodania
- ✅ Zasady cyberbezpieczeństwa - do ulepszenia
- ✅ Obsługa przypadków błędnych - częściowo zrobione

---

## 📝 Notatki

- Lista oficjalnych domen będzie dostępna na Discord
- Sandbox z przykładowymi stronami do testów
- Metadane certyfikatów SSL będą dostępne

---

## 🚀 Szybki start - co zaimplementować najpierw?

1. **Weryfikacja domeny .gov.pl** (30 min)
2. **Moduł bezpieczeństwa na stronie** (1h)
3. **Nonce w QR code** (1h)
4. **Komunikaty weryfikacji** (1h)
5. **Rate limiting** (30 min)

**Szacowany czas:** ~4-5 godzin

