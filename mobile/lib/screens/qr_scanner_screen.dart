import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:qr_code_scanner/qr_code_scanner.dart';
import '../services/api_service.dart';
import '../services/verification_history_service.dart';
import '../widgets/result_dialog.dart';
import '../widgets/verification_result_dialog.dart';
import '../utils/device_info_helper.dart';

class QRScannerScreen extends StatefulWidget {
  const QRScannerScreen({super.key});

  @override
  State<QRScannerScreen> createState() => _QRScannerScreenState();
}

class _QRScannerScreenState extends State<QRScannerScreen> {
  final GlobalKey qrKey = GlobalKey(debugLabel: 'QR');
  QRViewController? controller;
  bool isProcessing = false;
  String? lastScannedCode; // Zapamiętaj ostatni zeskanowany kod
  StreamSubscription? _scanSubscription; // Subskrypcja streamu

  @override
  void reassemble() {
    super.reassemble();
    if (Platform.isAndroid) {
      controller?.pauseCamera();
    } else if (Platform.isIOS) {
      controller?.resumeCamera();
    }
  }

  @override
  void dispose() {
    _scanSubscription?.cancel(); // Anuluj subskrypcję
    controller?.dispose();
    super.dispose();
  }

  Future<void> _onQRViewCreated(QRViewController controller) async {
    this.controller = controller;
    
    // Anuluj poprzednią subskrypcję jeśli istnieje
    await _scanSubscription?.cancel();
    
    // Utwórz nową subskrypcję
    _scanSubscription = controller.scannedDataStream.listen((scanData) async {
      // Sprawdź czy już przetwarzamy lub czy to ten sam kod
      if (isProcessing) return;
      
      final qrData = scanData.code;
      if (qrData != null && qrData.isNotEmpty) {
        // Sprawdź czy to nie ten sam kod co ostatnio
        if (qrData == lastScannedCode) {
          return; // Ignoruj ten sam kod
        }
        
        // Zapamiętaj zeskanowany kod
        lastScannedCode = qrData;
        
        // Zatrzymaj kamerę i stream natychmiast po zeskanowaniu
        await controller.pauseCamera();
        await _scanSubscription?.cancel(); // Zatrzymaj stream
        
        setState(() {
          isProcessing = true;
        });
        
        await _processQRData(qrData);
      }
    });
  }

  // Wznów skanowanie po błędzie
  Future<void> _resumeScanning() async {
    if (controller != null && mounted) {
      // Utwórz nową subskrypcję
      _scanSubscription = controller!.scannedDataStream.listen((scanData) async {
        if (isProcessing) return;
        
        final qrData = scanData.code;
        if (qrData != null && qrData.isNotEmpty) {
          // Sprawdź czy to nie ten sam kod co ostatnio
          if (qrData == lastScannedCode) {
            return;
          }
          
          lastScannedCode = qrData;
          await controller!.pauseCamera();
          await _scanSubscription?.cancel();
          
          setState(() {
            isProcessing = true;
          });
          
          await _processQRData(qrData);
        }
      });
    }
  }

  Future<void> _processQRData(String qrData) async {
    try {
      // Parsuj QR data - format: "token:nonce" lub tylko "token" (backward compatibility)
      String? token;
      String? nonce;
      
      if (qrData.contains(':')) {
        final parts = qrData.split(':');
        if (parts.length == 2) {
          token = parts[0];
          nonce = parts[1];
        } else {
          // Nieprawidłowy format
          _showErrorVerification(
            'Nieprawidłowy kod weryfikacyjny',
            'Kod może być uszkodzony',
          );
          return;
        }
      } else {
        // Backward compatibility - tylko token (bez nonce)
        token = qrData;
      }
      
      // Pobierz dane urządzenia
      final deviceId = await DeviceInfoHelper.getDeviceId();
      final deviceName = await DeviceInfoHelper.getDeviceName();
      
      // Wyślij potwierdzenie parowania
      final result = await ApiService.confirmPairing(
        token: token,
        nonce: nonce,
        deviceId: deviceId,
        deviceName: deviceName,
      );

      if (!mounted) return;

      // Zatrzymaj przetwarzanie przed pokazaniem dialogu/snackbar
      setState(() {
        isProcessing = false;
      });

      // Kamera jest już zatrzymana po zeskanowaniu, więc nie trzeba jej zatrzymywać ponownie

      if (result['success'] == true) {
        // SUKCES - pokaż dialog weryfikacji z instrukcjami
        final verificationResult = result['verification_result'] as Map<String, dynamic>?;
        final instructions = verificationResult?['instructions'] as List<dynamic>?;
        
        // Zapisz do historii
        await VerificationHistoryService.saveVerification(
          verified: true,
          message: verificationResult?['message'] ?? 'Strona jest zaufana i zweryfikowana.',
          deviceName: deviceName,
          verificationResult: verificationResult,
        );
        
        _showSuccessVerification(
          verificationResult?['message'] ?? 'Strona jest zaufana i zweryfikowana.',
          instructions?.cast<String>() ?? [],
        );
      } else {
        // Błąd - pokaż komunikat weryfikacji negatywnej
        final errorMessage = result['message'] ?? 'Błąd podczas weryfikacji';
        final detail = result['detail'] as String?;
        final errorType = result['error_type'] as String?;
        final verificationResult = result['verification_result'] as Map<String, dynamic>?;
        
        // Zapisz do historii
        await VerificationHistoryService.saveVerification(
          verified: false,
          message: errorMessage,
          deviceName: deviceName,
          errorType: errorType,
          verificationResult: verificationResult,
        );
        
        _showErrorVerification(
          errorMessage,
          detail ?? 'Nie udało się zweryfikować strony. Sprawdź kod QR i spróbuj ponownie.',
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          isProcessing = false;
        });
        
        String errorMessage = 'Błąd połączenia z serwerem';
        String instructions = 'Sprawdź połączenie internetowe i spróbuj ponownie.';
        
        if (e.toString().contains('SocketException') || 
            e.toString().contains('Failed host lookup')) {
          errorMessage = 'Nie można połączyć się z serwerem';
          instructions = 'Sprawdź połączenie internetowe.\nUpewnij się, że masz dostęp do sieci.';
        } else if (e.toString().contains('TimeoutException')) {
          errorMessage = 'Przekroczono limit czasu';
          instructions = 'Serwer nie odpowiedział w odpowiednim czasie.\nSpróbuj ponownie za chwilę.';
        } else if (e.toString().contains('400') || e.toString().contains('Invalid')) {
          errorMessage = 'Nieprawidłowy kod weryfikacyjny';
          instructions = 'Kod QR może być nieaktualny lub uszkodzony.\nWygeneruj nowy kod na stronie.';
        } else if (e.toString().contains('404')) {
          errorMessage = 'Kod weryfikacyjny nie został znaleziony';
          instructions = 'Kod może wygasnąć (ważny 5 minut).\nWygeneruj nowy kod na stronie.';
        } else if (e.toString().contains('410')) {
          errorMessage = 'Kod weryfikacyjny wygasł';
          instructions = 'Kody weryfikacyjne są ważne przez 5 minut.\nWygeneruj nowy kod na stronie.';
        } else if (e.toString().contains('429') || e.toString().contains('Rate limit')) {
          errorMessage = 'Zbyt wiele prób weryfikacji';
          instructions = 'Poczekaj chwilę przed kolejną próbą.\nOgraniczenie chroni przed nadużyciami.';
        }
        
        // Zapisz do historii
        await VerificationHistoryService.saveVerification(
          verified: false,
          message: errorMessage,
          errorType: 'network_error',
          verificationResult: {
            'verified': false,
            'message': errorMessage,
            'severity': 'error',
            'instructions': [instructions]
          },
        );
        
        _showErrorVerification(errorMessage, instructions);
      }
    }
  }

  void _showSuccessVerification(String message, List<String> instructions) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => VerificationResultDialog(
        success: true,
        title: 'Strona zweryfikowana',
        message: message.isNotEmpty ? message : 'Strona jest zaufana i zweryfikowana',
        instructions: instructions.isNotEmpty 
            ? instructions 
            : [
                'Możesz bezpiecznie korzystać z tej strony',
                'Sprawdź adres URL - powinien kończyć się na .gov.pl',
                'Zwróć uwagę na certyfikat SSL (🔒 w pasku adresu)'
              ],
        onClose: () {
          Navigator.of(context).pop(); // Zamknij dialog
          Navigator.of(context).pop(); // Wróć do HomeScreen
        },
      ),
    );
  }

  void _showErrorVerification(String errorMessage, String instructions) {
    // Przygotuj instrukcje na podstawie typu błędu
    List<String> errorInstructions = [instructions];
    
    // Dodatkowe instrukcje dla konkretnych typów błędów
    if (errorMessage.contains('wygasł') || errorMessage.contains('expired')) {
      errorInstructions = ['Wygeneruj nowy kod'];
    } else if (errorMessage.contains('już użyty') || errorMessage.contains('already')) {
      errorInstructions = ['Każdy kod może być użyty tylko raz'];
    } else if (errorMessage.contains('uszkodzony') || errorMessage.contains('Invalid')) {
      errorInstructions = ['Kod może być uszkodzony'];
    } else if (errorMessage.contains('Rate limit') || errorMessage.contains('429')) {
      errorInstructions = ['Poczekaj chwilę przed kolejną próbą'];
    }
    
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => VerificationResultDialog(
        success: false,
        title: 'Ostrzeżenie weryfikacji',
        message: errorMessage,
        instructions: errorInstructions,
        onClose: () {
          Navigator.of(context).pop(); // Zamknij dialog
          // Wznów skanowanie tylko jeśli użytkownik chce spróbować ponownie
          if (mounted) {
            // Wyczyść ostatni zeskanowany kod, aby móc zeskanować ponownie
            lastScannedCode = null;
            setState(() {
              isProcessing = false;
            });
            // Wznów kamerę i stream
            controller?.resumeCamera();
            _resumeScanning();
          }
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Skanuj kod QR'),
        centerTitle: true,
      ),
      body: Stack(
        children: [
          QRView(
            key: qrKey,
            onQRViewCreated: _onQRViewCreated,
            overlay: QrScannerOverlayShape(
              borderColor: const Color(0xFF0066CC),
              borderRadius: 16,
              borderLength: 30,
              borderWidth: 8,
              cutOutSize: 250,
            ),
          ),
          if (isProcessing)
            Container(
              color: Colors.black54,
              child: const Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    CircularProgressIndicator(
                      valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF0066CC)),
                    ),
                    SizedBox(height: 16),
                    Text(
                      'Przetwarzanie...',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

