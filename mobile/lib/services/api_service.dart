import 'dart:convert';
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
    String? deviceId,
    String? deviceName,
  }) async {
    try {
      final url = Uri.parse('$baseUrl/api/pairing/confirm');
      
      final body = <String, dynamic>{};
      if (token != null) {
        body['token'] = token;
      } else if (pin != null) {
        body['pin'] = pin;
      } else {
        throw Exception('Token lub PIN musi być podany');
      }
      
      if (deviceId != null) {
        body['device_id'] = deviceId;
      }
      if (deviceName != null) {
        body['device_name'] = deviceName;
      }

      final response = await http.post(
        url,
        headers: {
          'Content-Type': 'application/json',
        },
        body: jsonEncode(body),
      );

      print('ApiService - confirmPairing response status: ${response.statusCode}');
      print('ApiService - confirmPairing response body: ${response.body}');

      if (response.statusCode == 200) {
        final decoded = jsonDecode(response.body) as Map<String, dynamic>;
        print('ApiService - confirmPairing decoded: $decoded');
        print('ApiService - success value: ${decoded['success']}, type: ${decoded['success']?.runtimeType}');
        return decoded;
      } else if (response.statusCode == 404) {
        final error = jsonDecode(response.body);
        final detail = error['detail'] ?? 'Kod nie został znaleziony';
        
        String message = 'Nieprawidłowy kod';
        if (detail.contains('PIN')) {
          message = 'Nieprawidłowy kod PIN.\nSprawdź czy kod jest poprawny i nie wygasł.';
        } else if (detail.contains('Token')) {
          message = 'Nieprawidłowy kod QR.\nZeskanuj kod ponownie lub wygeneruj nowy.';
        } else {
          message = 'Kod nie został znaleziony lub wygasł.\nWygeneruj nowy kod na stronie.';
        }
        
        return {
          'success': false,
          'message': message,
        };
      } else if (response.statusCode == 410) {
        return {
          'success': false,
          'message': 'Kod wygasł (ważny 5 minut).\nWygeneruj nowy kod na stronie internetowej.',
        };
      } else if (response.statusCode == 400) {
        final error = jsonDecode(response.body);
        final detail = error['detail'] ?? 'Błąd podczas parowania';
        
        String message = detail;
        if (detail.contains('already confirmed')) {
          message = 'Ten kod został już użyty.\nWygeneruj nowy kod parowania.';
        } else if (detail.contains('must be provided')) {
          message = 'Brak kodu do parowania.';
        }
        
        return {
          'success': false,
          'message': message,
        };
      } else {
        return {
          'success': false,
          'message': 'Błąd serwera. Spróbuj ponownie później.',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Błąd połączenia: ${e.toString()}',
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

