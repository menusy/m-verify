import 'dart:io';
import 'package:flutter/material.dart';
import 'package:qr_code_scanner/qr_code_scanner.dart';
import '../services/api_service.dart';
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
    controller?.dispose();
    super.dispose();
  }

  Future<void> _onQRViewCreated(QRViewController controller) async {
    this.controller = controller;
    controller.scannedDataStream.listen((scanData) async {
      if (isProcessing) return;
      
      final qrData = scanData.code;
      if (qrData != null && qrData.isNotEmpty) {
        setState(() {
          isProcessing = true;
        });
        
        await _processQRData(qrData);
      }
    });
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
            'Nieprawidłowy format kodu QR.\nZeskanuj kod ponownie.',
            'Kod QR może być uszkodzony lub nieaktualny.',
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

      // Zatrzymaj kamerę po otrzymaniu odpowiedzi
      await controller?.pauseCamera();

      if (result['success'] == true) {
        // SUKCES - pokaż dialog weryfikacji z instrukcjami
        final verificationResult = result['verification_result'] as Map<String, dynamic>?;
        final instructions = verificationResult?['instructions'] as List<dynamic>?;
        
        _showSuccessVerification(
          verificationResult?['message'] ?? 'Strona jest zaufana i zweryfikowana.',
          instructions?.cast<String>() ?? [],
        );
      } else {
        // Błąd - pokaż komunikat weryfikacji negatywnej
        final errorMessage = result['message'] ?? 'Błąd podczas weryfikacji';
        final detail = result['detail'] as String?;
        
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
        message: message,
        instructions: instructions,
        onClose: () {
          Navigator.of(context).pop(); // Zamknij dialog
          Navigator.of(context).pop(); // Wróć do HomeScreen
        },
      ),
    );
  }

  void _showErrorVerification(String errorMessage, String instructions) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => VerificationResultDialog(
        success: false,
        title: 'Ostrzeżenie weryfikacji',
        message: errorMessage,
        instructions: [instructions],
        onClose: () {
          Navigator.of(context).pop(); // Zamknij dialog
          // Wznów skanowanie
          controller?.resumeCamera();
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

