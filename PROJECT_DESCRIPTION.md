# mVerify - Weryfikacja autentyczności stron gov.pl

## 📋 Opis projektu

**mVerify** to rozwiązanie umożliwiające obywatelom wiarygodną weryfikację autentyczności stron w domenach administracji publicznej (gov.pl) za pomocą aplikacji mobilnej mObywatel. System zapobiega oszustwom phishingowym poprzez szybką i prostą ścieżkę weryfikacji.

## 🎯 Problem

Oszustwa phishingowe w Polsce coraz częściej wykorzystują strony stylizowane na portale administracji rządowej. Cyberprzestępcy tworzą fałszywe kopie witryn, które wyglądają niemal identycznie jak oryginały, aby wyłudzić dane logowania do usług ePUAP, Profilu Zaufanego czy bankowości elektronicznej.

**Brakuje obecnie skutecznych, powszechnie dostępnych rozwiązań**, które pomagałyby obywatelom w zapobieganiu tego typu oszustwom.

## 💡 Rozwiązanie

mVerify to kompleksowe rozwiązanie składające się z:

1. **Moduł weryfikacji na stronie** - widoczny przycisk CTA do weryfikacji za pomocą kodu QR
2. **Panel bezpieczeństwa** - wyświetla informacje o domenie, certyfikacie SSL i wskaźniku zaufania
3. **Kompendium domen** - lista wszystkich oficjalnych domen .gov.pl z możliwością wyszukiwania
4. **Aplikacja mobilna mObywatel** - skanowanie kodu QR i weryfikacja autentyczności strony
5. **System jednorazowych kodów (nonce)** - ochrona przed replay attacks

## 🔄 Flow rozwiązania

### Scenariusz pozytywny (strona zweryfikowana):

1. Użytkownik odwiedza stronę gov.pl
2. Widzi panel bezpieczeństwa z informacją o domenie i SSL
3. Klika przycisk "Zweryfikuj autentyczność"
4. Generuje się unikalny kod QR i 6-cyfrowy PIN (ważny 5 minut)
5. Użytkownik skanuje kod QR w aplikacji mObywatel
6. Aplikacja weryfikuje kod i wysyła potwierdzenie
7. Strona wyświetla komunikat: **"Strona jest zaufana ✓"**
8. Użytkownik otrzymuje wskazówki do dalszego korzystania

### Scenariusz negatywny (strona niezweryfikowana):

1. Użytkownik odwiedza podejrzaną stronę
2. Panel bezpieczeństwa pokazuje: "Domena: Niezweryfikowana ⚠️"
3. Wskaźnik zaufania: "Niski"
4. Po weryfikacji przez QR aplikacja wyświetla:
   - **Czerwony komunikat ostrzegawczy**
   - Instrukcje: "Nie podawaj danych osobowych", "Zgłoś podejrzaną stronę"
   - Informacja o potencjalnym zagrożeniu

## 🛠️ Technologie

### Backend:
- **FastAPI** (Python) - REST API
- **Rate limiting** - ochrona przed nadużyciami
- **Walidacja wejścia** - sanityzacja tokenów, PIN, domen
- **Nonce system** - jednorazowe kody zapobiegające replay attacks

### Frontend:
- **HTML/CSS/JavaScript** (Vanilla JS)
- **Responsywny design**
- **Moduł bezpieczeństwa** - weryfikacja domeny i SSL
- **Kompendium domen** - wyszukiwarka i filtrowanie

### Aplikacja mobilna:
- **Flutter** (Dart)
- **QR Scanner** - skanowanie kodów weryfikacyjnych
- **Historia weryfikacji** - zapis wszystkich weryfikacji
- **Komunikaty weryfikacji** - pozytywne i negatywne scenariusze

## 🔒 Bezpieczeństwo

### Zaimplementowane mechanizmy:

1. **Szyfrowana komunikacja** - HTTPS
2. **Rate limiting** - 30-60 requestów/minutę w zależności od endpointu
3. **Walidacja wejścia** - sanityzacja tokenów, PIN, domen
4. **Nonce system** - jednorazowe kody w QR (zapobiega replay attacks)
5. **Automatyczne wygasanie** - kody ważne 5 minut
6. **Ochrona przed manipulacją** - walidacja formatu tokenów i nonce
7. **Obsługa błędów** - komunikaty dla użytkownika w przypadku problemów

## 📊 Funkcjonalności

### ✅ Zaimplementowane:

- [x] Przycisk CTA do weryfikacji za pomocą QR
- [x] Moduł informacyjny o bezpieczeństwie (domena, SSL, trust score)
- [x] Weryfikacja domeny .gov.pl
- [x] Link do kompendium stron rządowych
- [x] System QR z nonce (jednorazowe kody)
- [x] Komunikaty weryfikacji (pozytywne i negatywne)
- [x] Aplikacja mobilna z QR scannerem
- [x] Historia weryfikacji w aplikacji
- [x] Obsługa błędów (brak połączenia, nieprawidłowy kod)
- [x] Rate limiting i walidacja wejścia

## 🎨 UX/UI

- **Intuicyjny interfejs** - łatwy w użyciu dla użytkowników nie-technicznych
- **Wizualne wskaźniki** - kolory semantyczne (zielony, żółty, czerwony)
- **Responsywny design** - działa na wszystkich urządzeniach
- **Czytelne komunikaty** - jasne instrukcje dla użytkownika
- **Animacje i przejścia** - płynne doświadczenie użytkownika

## 📱 Aplikacja mobilna

Aplikacja Flutter umożliwia:
- Skanowanie kodów QR
- Wpisywanie 6-cyfrowego PIN
- Wyświetlanie wyników weryfikacji (pozytywnych i negatywnych)
- Historię wszystkich weryfikacji
- Szczegółowe instrukcje w przypadku ostrzeżeń

## 🚀 Instalacja i uruchomienie

### Backend:
```bash
cd backend
pip install -r requirements.txt
python main.py
```

### Frontend:
Frontend jest serwowany przez backend na `http://localhost:8000/list`

### Aplikacja mobilna:
```bash
cd mobile
flutter pub get
flutter run
```

## 📝 API Endpoints

- `POST /api/pairing/generate` - Generuje kod QR i PIN
- `GET /api/pairing/qr/{token}` - Zwraca obrazek QR code
- `GET /api/pairing/status/{token}` - Sprawdza status weryfikacji
- `POST /api/pairing/confirm` - Potwierdza weryfikację (z aplikacji mobilnej)
- `GET /api/domain/verify` - Weryfikuje domenę .gov.pl
- `GET /api/domains/compendium` - Zwraca kompendium domen

## 🎯 Zgodność z wymaganiami

### Wymagania formalne:
- ✅ Szczegółowy opis projektu (ten dokument)
- ⏳ Prezentacja PDF (10 slajdów) - w przygotowaniu
- ⏳ Film 3 minuty - w przygotowaniu
- ✅ Makety rozwiązania (w kodzie)
- ✅ Repozytorium kodu
- ✅ Zrzuty ekranu (w aplikacji)

### Wymagania techniczne:
- ✅ Szyfrowana komunikacja (HTTPS)
- ✅ Moduł lekki, niewpływający na wydajność
- ✅ Weryfikacja QR z nonce (jednorazowe kody)
- ✅ Zasady cyberbezpieczeństwa (rate limiting, walidacja)
- ✅ Obsługa przypadków błędnych

### Kryteria oceny:

1. **Związek z wyzwaniem (25%)** - Rozwiązanie bezpośrednio odpowiada na problem oszustw phishingowych
2. **Wdrożeniowy potencjał (25%)** - Gotowe do pilotażowego wdrożenia w mObywatel
3. **Walidacja i bezpieczeństwo danych (20%)** - Nonce, rate limiting, walidacja wejścia
4. **UX i ergonomia pracy (15%)** - Intuicyjny interfejs, czytelne komunikaty
5. **Innowacyjność i prezentacja (15%)** - Kompleksowe rozwiązanie z panelem bezpieczeństwa i kompendium

## 🔮 Możliwości rozwoju

- Integracja z systemami zgłaszania oszustw
- Statystyki weryfikacji
- Powiadomienia push o podejrzanych stronach
- Rozszerzenie na inne domeny publiczne
- Dashboard administracyjny

## 👥 Zespół

[Wpisz informacje o zespole]

## 📞 Kontakt

[Wpisz kontakt]

---

**Hackathon mObywatel 2024**
