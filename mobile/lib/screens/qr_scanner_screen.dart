import 'dart:io';
import 'package:flutter/material.dart';
import 'package:qr_code_scanner/qr_code_scanner.dart';
import '../services/api_service.dart';
import 'result_screen.dart';

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
      
      final token = scanData.code;
      if (token != null && token.isNotEmpty) {
        setState(() {
          isProcessing = true;
        });
        
        await _processToken(token);
      }
    });
  }

  Future<void> _processToken(String token) async {
    try {
      // Wyślij potwierdzenie parowania
      final result = await ApiService.confirmPairing(
        token: token,
        deviceName: 'Mobile App',
      );
      
      if (!mounted) {
        return;
      }

      // Sprawdź sukces - poprawiona logika
      final successValue = result['success'];
      print('QRScanner - successValue: $successValue, type: ${successValue?.runtimeType}');
      print('QRScanner - full result: $result');
      
      // Sprawdź czy sukces (obsługuje różne formaty: true, "true", 1, itp.)
      // Jeśli brak klucza 'success', sprawdź status code lub inne wskaźniki
      bool isSuccess = false;
      if (successValue != null) {
        isSuccess = successValue == true || 
                   successValue == 1 || 
                   (successValue is String && successValue.toLowerCase() == 'true') ||
                   (successValue is bool && successValue);
      } else {
        // Jeśli brak 'success', sprawdź czy jest message o sukcesie lub brak błędu
        final message = result['message']?.toString().toLowerCase() ?? '';
        isSuccess = message.contains('success') || 
                   message.contains('confirmed') ||
                   message.contains('pomyślnie');
      }

      print('QRScanner - isSuccess: $isSuccess');

      // Zatrzymaj kamerę przed nawigacją (w try-catch, żeby nie blokować nawigacji)
      try {
        await controller?.stopCamera();
        print('QRScanner - Camera stopped');
      } catch (e) {
        print('QRScanner - Error stopping camera: $e');
      }

      if (!mounted) {
        print('QRScanner - Widget not mounted after processing, cannot navigate');
        return;
      }

      if (isSuccess) {
        // SUKCES - natychmiast przejdź do pełnoekranowego ekranu sukcesu
        print('QRScanner - Entering success block');
        final message = result['message'] ?? 'Parowanie zakończone pomyślnie!';
        print('QRScanner - Navigating to success screen with message: $message');
        print('QRScanner - Context: $context');
        print('QRScanner - Navigator: ${Navigator.of(context)}');
        
        // Bezpośrednia nawigacja - użyj pushAndRemoveUntil, aby upewnić się, że poprzednie ekrany są usunięte
        try {
          Navigator.of(context).pushAndRemoveUntil(
            MaterialPageRoute(
              builder: (context) => ResultScreen(
                success: true,
                message: message,
              ),
            ),
            (route) => route.isFirst, // Zostaw tylko pierwszy ekran (HomeScreen)
          );
          print('QRScanner - Navigation to success screen completed');
        } catch (e) {
          print('QRScanner - Error during navigation: $e');
          // Fallback - spróbuj pushReplacement
          try {
            Navigator.of(context).pushReplacement(
              MaterialPageRoute(
                builder: (context) => ResultScreen(
                  success: true,
                  message: message,
                ),
              ),
            );
            print('QRScanner - Fallback navigation completed');
          } catch (e2) {
            print('QRScanner - Fallback navigation also failed: $e2');
          }
        }
      } else {
        // Błąd - pokaż pełnoekranowy ekran błędu
        print('QRScanner - Entering error block');
        final errorMessage = result['message'] ?? 'Błąd podczas parowania';
        print('QRScanner - Navigating to error screen with message: $errorMessage');
        
        try {
          Navigator.of(context).pushAndRemoveUntil(
            MaterialPageRoute(
              builder: (context) => ResultScreen(
                success: false,
                message: errorMessage,
              ),
            ),
            (route) => route.isFirst,
          );
          print('QRScanner - Navigation to error screen completed');
        } catch (e) {
          print('QRScanner - Error during error navigation: $e');
          try {
            Navigator.of(context).pushReplacement(
              MaterialPageRoute(
                builder: (context) => ResultScreen(
                  success: false,
                  message: errorMessage,
                ),
              ),
            );
          } catch (e2) {
            print('QRScanner - Fallback error navigation also failed: $e2');
          }
        }
      }
    } catch (e) {
      print('QRScanner - Error: $e');
      if (mounted) {
        await controller?.stopCamera();
        
        String errorMessage = 'Błąd połączenia z serwerem';
        if (e.toString().contains('SocketException') || 
            e.toString().contains('Failed host lookup')) {
          errorMessage = 'Nie można połączyć się z serwerem.\nSprawdź połączenie internetowe.';
        } else if (e.toString().contains('TimeoutException')) {
          errorMessage = 'Przekroczono limit czasu.\nSpróbuj ponownie.';
        }
        
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (context) => ResultScreen(
              success: false,
              message: errorMessage,
            ),
          ),
        );
      }
    } finally {
      // Resetuj flagę przetwarzania
      if (mounted) {
        setState(() {
          isProcessing = false;
        });
      }
    }
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

