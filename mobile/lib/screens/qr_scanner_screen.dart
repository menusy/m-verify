import 'dart:io';
import 'package:flutter/material.dart';
import 'package:qr_code_scanner/qr_code_scanner.dart';
import '../services/api_service.dart';
import '../widgets/result_dialog.dart';

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

      if (!mounted) return;

      // Zatrzymaj przetwarzanie przed pokazaniem dialogu/snackbar
      setState(() {
        isProcessing = false;
      });

      // Zatrzymaj kamerę po otrzymaniu odpowiedzi
      await controller?.pauseCamera();

      if (result['success'] == true) {
        // SUKCES - pokaż dialog sukcesu
        showDialog(
          context: context,
          barrierDismissible: false,
          builder: (context) => ResultDialog(
            success: true,
            message: 'Parowanie zakończone pomyślnie!',
            onClose: () {
              Navigator.of(context).pop(); // Zamknij dialog
              Navigator.of(context).pop(); // Wróć do HomeScreen
            },
          ),
        );
      } else {
        // Błąd - pokaż SnackBar i wznowij skanowanie
        final errorMessage = result['message'] ?? 'Błąd podczas parowania';
        
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.error_outline, color: Colors.white),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    errorMessage,
                    style: const TextStyle(fontSize: 15),
                  ),
                ),
              ],
            ),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 4),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        );
        
        // Wznów skanowanie po pokazaniu błędu
        await Future.delayed(const Duration(milliseconds: 500));
        if (mounted) {
          await controller?.resumeCamera();
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          isProcessing = false;
        });
        
        String errorMessage = 'Błąd połączenia z serwerem';
        if (e.toString().contains('SocketException') || 
            e.toString().contains('Failed host lookup')) {
          errorMessage = 'Nie można połączyć się z serwerem.\nSprawdź połączenie internetowe.';
        } else if (e.toString().contains('TimeoutException')) {
          errorMessage = 'Przekroczono limit czasu.\nSpróbuj ponownie.';
        }
        
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.wifi_off, color: Colors.white),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    errorMessage,
                    style: const TextStyle(fontSize: 15),
                  ),
                ),
              ],
            ),
            backgroundColor: Colors.orange,
            duration: const Duration(seconds: 5),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        );
        
        // Wznów skanowanie po pokazaniu błędu
        await Future.delayed(const Duration(milliseconds: 500));
        if (mounted) {
          await controller?.resumeCamera();
        }
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

