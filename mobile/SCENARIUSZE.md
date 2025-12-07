# Scenariusze użycia aplikacji

## ✅ Scenariusz 1: Poprawny kod QR

**Co się dzieje:**
1. Użytkownik skanuje kod QR z kamery
2. Aplikacja pokazuje ekran "Przetwarzanie..." z kółkiem ładowania
3. Po pomyślnym parowaniu wyświetla się **Dialog Sukcesu**:
   - 🟢 Zielona ikona check_circle
   - Tekst: "Sukces!"
   - Komunikat: "Parowanie zakończone pomyślnie!"
   - Przycisk "OK" (zielony)
4. Po kliknięciu OK użytkownik wraca do ekranu głównego

---

## ✅ Scenariusz 2: Poprawny kod PIN

**Co się dzieje:**
1. Użytkownik wpisuje 6-cyfrowy kod PIN (automatycznie przechodzi między polami)
2. Po wpisaniu 6 cyfr automatycznie wysyła się żądanie
3. Pokazuje się kółko ładowania
4. Po pomyślnym parowaniu wyświetla się **Dialog Sukcesu**:
   - 🟢 Zielona ikona check_circle
   - Tekst: "Sukces!"
   - Komunikat: "Parowanie zakończone pomyślnie!"
   - Przycisk "OK" (zielony)
5. Po kliknięciu OK użytkownik wraca do ekranu głównego

---

## ❌ Scenariusz 3: Nieprawidłowy kod PIN

**Co się dzieje:**
1. Użytkownik wpisuje nieprawidłowy kod PIN
2. Pokazuje się kółko ładowania
3. Po otrzymaniu błędu wyświetla się **Czerwony SnackBar**:
   - 🔴 Czerwona ikona error_outline
   - Komunikat: "Nieprawidłowy kod PIN. Sprawdź czy kod jest poprawny i nie wygasł."
   - SnackBar jest widoczny przez 4 sekundy
4. Pola PIN są automatycznie wyczyszczone
5. Fokus wraca do pierwszego pola
6. Użytkownik może spróbować ponownie

**Możliwe komunikaty błędów:**
- "Nieprawidłowy kod PIN. Sprawdź czy kod jest poprawny i nie wygasł."
- "Kod nie został znaleziony lub wygasł. Wygeneruj nowy kod na stronie."

---

## ❌ Scenariusz 4: Nieprawidłowy kod QR

**Co się dzieje:**
1. Użytkownik skanuje nieprawidłowy kod QR
2. Pokazuje się ekran "Przetwarzanie..."
3. Po otrzymaniu błędu wyświetla się **Czerwony SnackBar**:
   - 🔴 Czerwona ikona error_outline
   - Komunikat: "Nieprawidłowy kod QR. Zeskanuj kod ponownie lub wygeneruj nowy."
   - Przycisk "Spróbuj ponownie"
   - SnackBar jest widoczny przez 4 sekundy
4. Kamera automatycznie wznawia skanowanie
5. Użytkownik może zeskanować ponownie

**Możliwe komunikaty błędów:**
- "Nieprawidłowy kod QR. Zeskanuj kod ponownie lub wygeneruj nowy."
- "Kod nie został znaleziony lub wygasł. Wygeneruj nowy kod na stronie."

---

## ❌ Scenariusz 5: Kod wygasł (PIN lub QR)

**Co się dzieje:**
1. Użytkownik próbuje użyć kodu, który wygasł (po 5 minutach)
2. Pokazuje się kółko ładowania / ekran "Przetwarzanie..."
3. Wyświetla się **Czerwony SnackBar**:
   - 🔴 Czerwona ikona error_outline
   - Komunikat: "Kod wygasł (ważny 5 minut). Wygeneruj nowy kod na stronie internetowej."
   - SnackBar jest widoczny przez 4 sekundy
4. Dla PIN: pola są wyczyszczone
5. Dla QR: kamera wznawia skanowanie
6. Użytkownik musi wygenerować nowy kod na stronie

---

## ❌ Scenariusz 6: Kod już użyty

**Co się dzieje:**
1. Użytkownik próbuje użyć kodu, który został już użyty wcześniej
2. Pokazuje się kółko ładowania / ekran "Przetwarzanie..."
3. Wyświetla się **Czerwony SnackBar**:
   - 🔴 Czerwona ikona error_outline
   - Komunikat: "Ten kod został już użyty. Wygeneruj nowy kod parowania."
   - SnackBar jest widoczny przez 4 sekundy
4. Użytkownik musi wygenerować nowy kod na stronie

---

## ❌ Scenariusz 7: Brak połączenia z serwerem

**Co się dzieje:**
1. Użytkownik próbuje sparować, ale nie ma połączenia z internetem lub serwer nie działa
2. Pokazuje się kółko ładowania / ekran "Przetwarzanie..."
3. Wyświetla się **Pomarańczowy SnackBar**:
   - 🟠 Pomarańczowa ikona wifi_off
   - Komunikat: "Nie można połączyć się z serwerem. Sprawdź połączenie internetowe."
   - SnackBar jest widoczny przez 5 sekund
4. Dla PIN: pola są wyczyszczone
5. Dla QR: kamera wznawia skanowanie
6. Użytkownik powinien sprawdzić połączenie i spróbować ponownie

**Możliwe komunikaty błędów:**
- "Nie można połączyć się z serwerem. Sprawdź połączenie internetowe."
- "Przekroczono limit czasu. Spróbuj ponownie."

---

## 📱 Wizualne elementy

### Dialog Sukcesu:
- ✅ Zielona ikona check_circle (64px)
- Zielone tło ikony (przezroczyste)
- Tekst "Sukces!" w kolorze zielonym
- Komunikat sukcesu
- Zielony przycisk "OK"

### SnackBar Błędu:
- ❌ Czerwona ikona error_outline
- Czerwone tło
- Biały tekst
- Zaokrąglone rogi
- Floating behavior (unosi się nad zawartością)
- Czas wyświetlania: 4 sekundy

### SnackBar Błędu Połączenia:
- 📶 Pomarańczowa ikona wifi_off
- Pomarańczowe tło
- Biały tekst
- Czas wyświetlania: 5 sekund

---

## 🔄 Automatyczne akcje

### Po sukcesie:
- ✅ Dialog sukcesu (nie można zamknąć przez kliknięcie poza nim)
- ✅ Automatyczne zamknięcie kamery (dla QR)
- ✅ Powrót do ekranu głównego po kliknięciu OK

### Po błędzie:
- ❌ Automatyczne wyczyszczenie pól PIN
- ❌ Powrót fokusa do pierwszego pola PIN
- ❌ Automatyczne wznowienie kamery (dla QR)
- ❌ Możliwość ponownej próby


