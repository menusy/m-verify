import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;

class ApiService {
  // Adres produkcyjnego backendu na Railway
  static const String baseUrl = 'https://m-verify-production.up.railway.app';
  // Dla lokalnego rozwoju użyj: 'http://localhost:8000'
  // Dla emulatora Android użyj: 'http://10.0.2.2:8000'
  // Dla emulatora iOS użyj: 'http://localhost:8000'

  static Future<Map<String, dynamic>> confirmPairing({
    String? token,
    String? pin,
    String? nonce,
    String? deviceId,
    String? deviceName,
  }) async {
    try {
      final url = Uri.parse('$baseUrl/api/pairing/confirm');
      
      final body = <String, dynamic>{};
      if (token != null) {
        body['token'] = token;
        // Jeśli jest token, powinien być też nonce (z QR code)
        if (nonce != null) {
          body['nonce'] = nonce;
        }
      } else if (pin != null) {
        body['pin'] = pin;
        // PIN nie wymaga nonce
      } else {
        throw Exception('Token lub PIN musi być podany');
      }
      
      if (deviceId != null) {
        body['device_id'] = deviceId;
      }
      if (deviceName != null) {
        body['device_name'] = deviceName;
      }

      // Timeout 30 sekund dla weryfikacji
      final response = await http.post(
        url,
        headers: {
          'Content-Type': 'application/json',
        },
        body: jsonEncode(body),
      ).timeout(
        const Duration(seconds: 30),
        onTimeout: () {
          throw TimeoutException(
            'Request timeout - serwer nie odpowiedział w ciągu 30 sekund',
          );
        },
      );

      print('ApiService - confirmPairing response status: ${response.statusCode}');
      print('ApiService - confirmPairing response body: ${response.body}');

      if (response.statusCode == 200) {
        final decoded = jsonDecode(response.body) as Map<String, dynamic>;
        print('ApiService - confirmPairing decoded: $decoded');
        print('ApiService - success value: ${decoded['success']}, type: ${decoded['success']?.runtimeType}');
        return decoded;
      } else if (response.statusCode == 400) {
        final error = jsonDecode(response.body);
        final detail = error['detail'] ?? 'Błąd podczas weryfikacji';
        
        // Sprawdź typ błędu z nagłówków
        final verificationResult = response.headers['x-verification-result'];
        
        String message = detail;
        String instructions = 'Sprawdź kod QR i spróbuj ponownie.';
        
        if (detail.contains('already confirmed') || verificationResult == 'already_confirmed') {
          message = 'Kod już użyty';
          instructions = 'Każdy kod może być użyty tylko raz';
        } else if (detail.contains('Nonce already used') || verificationResult == 'nonce_used') {
          message = 'Kod QR został już zeskanowany';
          instructions = 'Każdy kod może być użyty tylko raz';
        } else if (detail.contains('Invalid nonce') || verificationResult == 'invalid_nonce') {
          message = 'Nieprawidłowy kod weryfikacyjny';
          instructions = 'Kod może być uszkodzony';
        } else if (detail.contains('must be provided')) {
          message = 'Brak danych do weryfikacji';
          instructions = 'Upewnij się, że zeskanowałeś poprawny kod QR';
        }
        
        return {
          'success': false,
          'message': message,
          'detail': instructions,
          'verification_result': {
            'verified': false,
            'message': message,
            'severity': 'error',
            'instructions': [instructions]
          }
        };
      } else if (response.statusCode == 404) {
        final error = jsonDecode(response.body);
        final detail = error['detail'] ?? 'Kod nie został znaleziony';
        
        String message = 'Kod weryfikacyjny nie został znaleziony';
        String instructions = 'Kod może wygasnąć (ważny 5 minut).\nWygeneruj nowy kod na stronie.';
        
        if (detail.contains('PIN')) {
          message = 'Nieprawidłowy kod PIN';
          instructions = 'Sprawdź czy kod jest poprawny i nie wygasł.\nKody PIN są ważne przez 5 minut.';
        } else if (detail.contains('Token')) {
          message = 'Nieprawidłowy kod QR';
          instructions = 'Zeskanuj kod ponownie lub wygeneruj nowy.\nKody QR są ważne przez 5 minut.';
        }
        
        return {
          'success': false,
          'message': message,
          'detail': instructions,
          'verification_result': {
            'verified': false,
            'message': message,
            'severity': 'error',
            'instructions': [instructions]
          }
        };
      } else if (response.statusCode == 410) {
        return {
          'success': false,
          'message': 'Kod wygasł',
          'detail': 'Wygeneruj nowy kod',
          'verification_result': {
            'verified': false,
            'message': 'Kod wygasł',
            'severity': 'expired',
            'instructions': [
              'Wygeneruj nowy kod'
            ]
          }
        };
      } else if (response.statusCode == 429) {
        return {
          'success': false,
          'message': 'Zbyt wiele prób weryfikacji',
          'detail': 'Poczekaj chwilę przed kolejną próbą',
          'verification_result': {
            'verified': false,
            'message': 'Zbyt wiele prób weryfikacji',
            'severity': 'rate_limit',
            'instructions': [
              'Poczekaj chwilę przed kolejną próbą'
            ]
          }
        };
      } else {
        return {
          'success': false,
          'message': 'Błąd serwera',
          'detail': 'Spróbuj ponownie później.',
          'verification_result': {
            'verified': false,
            'message': 'Błąd serwera',
            'severity': 'error',
            'instructions': [
              'Wystąpił błąd po stronie serwera.',
              'Spróbuj ponownie za chwilę.',
              'Jeśli problem się powtarza, skontaktuj się z pomocą techniczną.'
            ]
          }
        };
      }
    } on SocketException catch (e) {
      return {
        'success': false,
        'message': 'Brak połączenia z internetem',
        'detail': 'Sprawdź połączenie internetowe i spróbuj ponownie.',
        'error_type': 'no_connection',
        'verification_result': {
          'verified': false,
          'message': 'Brak połączenia z internetem',
          'severity': 'error',
          'instructions': [
            'Sprawdź czy masz włączone Wi-Fi lub dane mobilne.',
            'Upewnij się, że masz dostęp do internetu.',
            'Spróbuj ponownie po przywróceniu połączenia.'
          ]
        }
      };
    } on HttpException catch (e) {
      return {
        'success': false,
        'message': 'Błąd połączenia HTTP',
        'detail': 'Nie można nawiązać połączenia z serwerem.',
        'error_type': 'http_error',
        'verification_result': {
          'verified': false,
          'message': 'Błąd połączenia z serwerem',
          'severity': 'error',
          'instructions': [
            'Sprawdź połączenie internetowe.',
            'Serwer może być tymczasowo niedostępny.',
            'Spróbuj ponownie za chwilę.'
          ]
        }
      };
    } on TimeoutException catch (e) {
      return {
        'success': false,
        'message': 'Przekroczono limit czasu',
        'detail': 'Serwer nie odpowiedział w ciągu 30 sekund.',
        'error_type': 'timeout',
        'verification_result': {
          'verified': false,
          'message': 'Przekroczono limit czasu',
          'severity': 'timeout',
          'instructions': [
            'Serwer nie odpowiedział w odpowiednim czasie.',
            'Sprawdź połączenie internetowe.',
            'Spróbuj ponownie za chwilę.'
          ]
        }
      };
    } on FormatException catch (e) {
      return {
        'success': false,
        'message': 'Błąd formatu odpowiedzi',
        'detail': 'Serwer zwrócił nieprawidłową odpowiedź.',
        'error_type': 'format_error',
        'verification_result': {
          'verified': false,
          'message': 'Błąd formatu odpowiedzi',
          'severity': 'error',
          'instructions': [
            'Serwer zwrócił nieprawidłową odpowiedź.',
            'Spróbuj ponownie.',
            'Jeśli problem się powtarza, skontaktuj się z pomocą techniczną.'
          ]
        }
      };
    } catch (e) {
      // Ogólny błąd
      String errorMessage = 'Nieoczekiwany błąd';
      String errorType = 'unknown';
      
      if (e.toString().contains('Failed host lookup')) {
        errorMessage = 'Nie można znaleźć serwera';
        errorType = 'host_lookup_failed';
      } else if (e.toString().contains('Connection refused')) {
        errorMessage = 'Połączenie odrzucone';
        errorType = 'connection_refused';
      }
      
      return {
        'success': false,
        'message': errorMessage,
        'detail': 'Wystąpił nieoczekiwany błąd: ${e.toString()}',
        'error_type': errorType,
        'verification_result': {
          'verified': false,
          'message': errorMessage,
          'severity': 'error',
          'instructions': [
            'Wystąpił nieoczekiwany błąd.',
            'Spróbuj ponownie.',
            'Jeśli problem się powtarza, skontaktuj się z pomocą techniczną.'
          ]
        }
      };
    }
  }

  static Future<Map<String, dynamic>> checkHealth() async {
    try {
      final url = Uri.parse('$baseUrl/health');
      final response = await http.get(url);

      if (response.statusCode == 200) {
        return jsonDecode(response.body) as Map<String, dynamic>;
      } else {
        return {'status': 'error'};
      }
    } catch (e) {
      return {'status': 'error', 'message': e.toString()};
    }
  }
}

