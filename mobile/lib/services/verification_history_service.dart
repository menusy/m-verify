import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class VerificationRecord {
  final String id;
  final DateTime timestamp;
  final bool verified;
  final String message;
  final String? domain;
  final String? deviceName;
  final String? errorType;
  final Map<String, dynamic>? verificationResult;

  VerificationRecord({
    required this.id,
    required this.timestamp,
    required this.verified,
    required this.message,
    this.domain,
    this.deviceName,
    this.errorType,
    this.verificationResult,
  });

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'timestamp': timestamp.toIso8601String(),
      'verified': verified,
      'message': message,
      'domain': domain,
      'device_name': deviceName,
      'error_type': errorType,
      'verification_result': verificationResult,
    };
  }

  factory VerificationRecord.fromJson(Map<String, dynamic> json) {
    return VerificationRecord(
      id: json['id'] as String,
      timestamp: DateTime.parse(json['timestamp'] as String),
      verified: json['verified'] as bool,
      message: json['message'] as String,
      domain: json['domain'] as String?,
      deviceName: json['device_name'] as String?,
      errorType: json['error_type'] as String?,
      verificationResult: json['verification_result'] as Map<String, dynamic>?,
    );
  }
}

class VerificationHistoryService {
  static const String _historyKey = 'verification_history';
  static const int _maxRecords = 100; // Maksymalna liczba rekordów w historii

  /// Zapisuje rekord weryfikacji do historii
  static Future<void> saveVerification({
    required bool verified,
    required String message,
    String? domain,
    String? deviceName,
    String? errorType,
    Map<String, dynamic>? verificationResult,
  }) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final history = await getHistory();
      
      final record = VerificationRecord(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        timestamp: DateTime.now(),
        verified: verified,
        message: message,
        domain: domain,
        deviceName: deviceName,
        errorType: errorType,
        verificationResult: verificationResult,
      );
      
      // Dodaj na początku listy (najnowsze na górze)
      history.insert(0, record);
      
      // Ogranicz do maksymalnej liczby rekordów
      if (history.length > _maxRecords) {
        history.removeRange(_maxRecords, history.length);
      }
      
      // Zapisz do SharedPreferences
      final jsonList = history.map((r) => r.toJson()).toList();
      await prefs.setString(_historyKey, jsonEncode(jsonList));
    } catch (e) {
      print('Error saving verification history: $e');
    }
  }

  /// Pobiera całą historię weryfikacji
  static Future<List<VerificationRecord>> getHistory() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final historyJson = prefs.getString(_historyKey);
      
      if (historyJson == null) {
        return [];
      }
      
      final List<dynamic> jsonList = jsonDecode(historyJson);
      return jsonList
          .map((json) => VerificationRecord.fromJson(json as Map<String, dynamic>))
          .toList();
    } catch (e) {
      print('Error loading verification history: $e');
      return [];
    }
  }

  /// Pobiera historię weryfikacji z filtrem (tylko sukcesy lub tylko błędy)
  static Future<List<VerificationRecord>> getHistoryFiltered({
    bool? verified,
  }) async {
    final history = await getHistory();
    if (verified == null) {
      return history;
    }
    return history.where((record) => record.verified == verified).toList();
  }

  /// Usuwa całą historię
  static Future<void> clearHistory() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_historyKey);
    } catch (e) {
      print('Error clearing verification history: $e');
    }
  }

  /// Usuwa pojedynczy rekord
  static Future<void> deleteRecord(String id) async {
    try {
      final history = await getHistory();
      history.removeWhere((record) => record.id == id);
      
      final prefs = await SharedPreferences.getInstance();
      final jsonList = history.map((r) => r.toJson()).toList();
      await prefs.setString(_historyKey, jsonEncode(jsonList));
    } catch (e) {
      print('Error deleting verification record: $e');
    }
  }

  /// Pobiera statystyki weryfikacji
  static Future<Map<String, int>> getStatistics() async {
    final history = await getHistory();
    return {
      'total': history.length,
      'verified': history.where((r) => r.verified).length,
      'failed': history.where((r) => !r.verified).length,
    };
  }
}


