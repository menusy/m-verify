# mVerify – weryfikacja autentyczności stron gov.pl z pomocą mObywatel

[👉 Zobacz demo wideo](https://youtube.com/shorts/TReF19UvBQk?feature=share)

[![Demo wideo – mVerify](https://i.ibb.co/HpTwwZ7g/Screenshot-2025-12-07-at-10-57-47.png)](https://youtube.com/shorts/TReF19UvBQk?feature=share)

## Opis projektu

Projekt realizuje wyzwanie **„Weryfikacja autentyczności stron gov.pl za pomocą aplikacji mObywatel”**.

Tworzymy lekki moduł do osadzania na stronach gov.pl, który pozwala obywatelowi:

- **sprawdzić, czy domena jest oficjalną domeną `.gov.pl`**,  
- **upewnić się, że połączenie jest szyfrowane (HTTPS)**,  
- **przeprowadzić końcową weryfikację w aplikacji mObywatel** za pomocą jednorazowego kodu QR / PIN (nonce),  
- **zobaczyć czytelny wynik weryfikacji** w aplikacji i na stronie.

Projekt dostarcza **jeden, spójny mechanizm weryfikacji zaufania do strony**, który:

- działa dokładnie tam, gdzie użytkownik ma wątpliwość – **bezpośrednio na stronie www**,  
- wykorzystuje **oficjalne źródła** (rejestr domen .gov.pl, informacje o certyfikacie, aplikację mObywatel),  
- prezentuje wynik w formie **prostego, wizualnego wskaźnika zaufania** (znak zaufania, komunikat „strona jest zaufana” / ostrzeżenie),  
- prowadzi użytkownika **krok po kroku**: od kliknięcia przycisku na stronie, przez zeskanowanie kodu QR w mObywatelu, po jasny komunikat zwrotny w obu kanałach (na stronie i w aplikacji).

Dzięki temu odpowiedzialność za ocenę wiarygodności serwisu nie spada wyłącznie na „technikalia” (certyfikat, wygląd strony), ale jest **współdzielona** między użytkownika, stronę gov.pl i aplikację mObywatel, które wspólnie budują zaufanie do konkretnej domeny.

Projekt odpowiada też na problem po stronie instytucji publicznych. Dziś każda instytucja publikuje własne komunikaty o bezpieczeństwie, a działania edukacyjne są rozproszone i trudne do skalowania – szczególnie w sytuacjach kryzysowych (kampanie oszustw, fałszywe serwisy „na gorąco”).

Zastosowanie jednego, wspólnego modułu weryfikacji oraz aplikacji mObywatel pozwala **ujednolicić sposób komunikowania zaufania** do stron rządowych w całej administracji. Dodatkowo, projekt przenosi uwagę użytkownika z technicznych szczegółów (np. analiza adresu URL, nagłówków certyfikatu) na **zrozumiały, wspólny język zaufania** – „ten serwis został potwierdzony w mObywatel”. To obniża barierę wejścia dla osób mniej technicznych, a jednocześnie zwiększa skuteczność ostrzeżeń przed fałszywymi witrynami, bo komunikat pochodzi z **jednego, zaufanego źródła** – oficjalnej aplikacji państwowej.

## Co zrobiliśmy do tej pory

### Przycisk zaufania na stronie

- Na każdej stronie z naszym modułem jest widoczny przycisk **„Zweryfikuj, czy jest oficjalna!”**.  
- Po kliknięciu otwiera się okno z kodem QR i PIN‑em, które można zeskanować w mObywatel.

### „Znak zaufania” po pozytywnej weryfikacji

- Po udanym potwierdzeniu w mObywatel strona pamięta, że użytkownik zweryfikował tę domenę.  
- Użytkownik otrzymuje wizualny **badge / znak zaufania**, który potwierdza, że jest „na dobrej stronie”.

### Bezpieczny kod QR / PIN

- Kod działa tylko przez kilka minut, po czym wygasa.  
- Użytkownik widzi jasny komunikat: kiedy kod jest aktywny, a kiedy trzeba wygenerować nowy – **bez straszenia wygaśnięciem**, jeśli to tylko błąd połączenia.

### Panel bezpieczeństwa serwisu (FAB z tarczą)

- W lewym dolnym rogu strony jest **pływający przycisk z tarczą (FAB)**.  
- Po kliknięciu pokazuje się mały panel, który w jednym miejscu zbiera podstawowe informacje:
  - na jakiej **domenie** jesteś,  
  - czy połączenie jest zabezpieczone **HTTPS**,  
  - prosty **wskaźnik zaufania** do tej domeny,  
  - link do **kompendium oficjalnych stron gov.pl**.

### Sprawdzenie domeny w tle

- Moduł sam, „pod maską”, sprawdza w przygotowanej liście, czy dana domena jest oficjalną domeną `.gov.pl`.  
- Użytkownik dostaje z tego tylko prosty efekt: komunikat **„domena zweryfikowana / niezweryfikowana”** i procentowy poziom zaufania.

### Współpraca ze skanerem w mObywatelu

W aplikacji mobilnej można:

- zeskanować kod QR z ekranu,  
- albo wpisać 6‑cyfrowy PIN z przeglądarki.

Aplikacja pokazuje wyraźnie:

- **zielony scenariusz** – ta strona jest zaufana,  
- **czerwony scenariusz** – coś jest nie tak, uważaj i nie podawaj danych.

W panelu bezpieczeństwa na stronie zmienia się treść na:

- "ta domena została zweryfikowana w mObywatel",  
- pojawia się widoczny **badge / znak zaufania**, który daje użytkownikowi spokój, że jest „na dobrej stronie”.

### W skrócie

Z poziomu **jednej strony www** użytkownik może:

- zobaczyć podstawowe informacje o bezpieczeństwie,  
- potwierdzić stronę w mObywatel,  
- dostać prosty, czytelny znak: **„tej stronie możesz ufać”** albo **„uważaj”**.
