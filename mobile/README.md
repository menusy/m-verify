# Gov Mobile - Aplikacja Flutter

Aplikacja mobilna do parowania z systemem Gov poprzez skanowanie QR code lub wpisanie 6-cyfrowego kodu PIN.

## Funkcjonalności

- ✅ Skanowanie kodów QR
- ✅ Wpisywanie 6-cyfrowego kodu PIN
- ✅ Parowanie z systemem backendowym
- ✅ Intuicyjny interfejs użytkownika

## Wymagania

- Flutter SDK >= 3.0.0
- Dart SDK >= 3.0.0
- Android Studio / VS Code z rozszerzeniem Flutter
- Dla Android: minSdkVersion 21
- Dla iOS: iOS 11.0+

## Instalacja

1. Przejdź do katalogu aplikacji:
```bash
cd mobile
```

2. Zainstaluj zależności:
```bash
flutter pub get
```

3. Uruchom aplikację:
```bash
flutter run
```

## Konfiguracja API

W pliku `lib/services/api_service.dart` ustaw prawidłowy adres URL backendu:

```dart
static const String baseUrl = 'http://localhost:8000';
```

**Ważne - adresy URL dla różnych środowisk:**

- **Emulator Android**: `http://10.0.2.2:8000`
- **Emulator iOS**: `http://localhost:8000`
- **Prawdziwe urządzenie**: `http://192.168.1.X:8000` (gdzie X to IP Twojego komputera)

Aby znaleźć IP komputera:
- **Windows**: `ipconfig` w CMD
- **macOS/Linux**: `ifconfig` lub `ip addr`

## Użycie

### Skanowanie QR Code

1. Uruchom backend (`python backend/main.py`)
2. Otwórz stronę `http://localhost:8000/list`
3. Kliknij "Połącz z aplikacją mobilną"
4. W aplikacji mobilnej wybierz "Zeskanuj kod QR"
5. Zeskanuj kod QR wyświetlony na stronie

### Wpisanie PIN

1. Uruchom backend
2. Otwórz stronę i wygeneruj kod parowania
3. W aplikacji mobilnej wybierz "Wpisz kod PIN"
4. Wprowadź 6-cyfrowy kod wyświetlony na stronie
5. Kod zostanie automatycznie przesłany po wpisaniu 6 cyfr

## Uprawnienia

Aplikacja wymaga uprawnień do kamery dla skanowania QR code:

### Android (`android/app/src/main/AndroidManifest.xml`):
```xml
<uses-permission android:name="android.permission.CAMERA" />
```

### iOS (`ios/Runner/Info.plist`):
```xml
<key>NSCameraUsageDescription</key>
<string>Potrzebujemy dostępu do kamery do skanowania kodów QR</string>
```

## Struktura projektu

```
mobile/
├── lib/
│   ├── main.dart                 # Punkt wejścia aplikacji
│   ├── screens/
│   │   ├── home_screen.dart      # Ekran główny z wyborem metody
│   │   ├── qr_scanner_screen.dart # Ekran skanowania QR
│   │   └── pin_input_screen.dart  # Ekran wpisywania PIN
│   ├── services/
│   │   └── api_service.dart      # Komunikacja z API
│   └── widgets/
│       └── result_dialog.dart    # Dialog z wynikiem parowania
├── pubspec.yaml                  # Zależności projektu
└── README.md
```

## Rozwiązywanie problemów

### Problem: Aplikacja nie może połączyć się z API

1. Sprawdź czy backend działa: `http://localhost:8000/health`
2. Sprawdź adres URL w `api_service.dart`
3. Dla prawdziwego urządzenia upewnij się, że telefon i komputer są w tej samej sieci WiFi
4. Sprawdź firewall - port 8000 musi być otwarty

### Problem: Kamera nie działa

1. Sprawdź uprawnienia w ustawieniach aplikacji
2. Upewnij się, że urządzenie ma kamerę
3. Sprawdź logi: `flutter logs`

### Problem: QR code nie skanuje się

1. Upewnij się, że kod QR jest wyraźny i dobrze oświetlony
2. Sprawdź czy kod nie wygasł (ważny 5 minut)
3. Wygeneruj nowy kod QR na stronie

## Build dla produkcji

### Android (APK):
```bash
flutter build apk --release
```

### Android (App Bundle):
```bash
flutter build appbundle --release
```

### iOS:
```bash
flutter build ios --release
```

## Wsparcie

W razie problemów sprawdź:
- Dokumentację Flutter: https://flutter.dev/docs
- Dokumentację qr_code_scanner: https://pub.dev/packages/qr_code_scanner

# m-verify

