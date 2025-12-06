import 'package:flutter/material.dart';
import 'screens/home_screen.dart';

void main() {
  runApp(const GovApp());
}

class GovApp extends StatelessWidget {
  const GovApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Gov Mobile',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF0066CC),
          brightness: Brightness.light,
        ),
        useMaterial3: true,
        scaffoldBackgroundColor: Colors.white,
      ),
      darkTheme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF0066CC),
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      themeMode: ThemeMode.system,
      home: const HomeScreen(),
      debugShowCheckedModeBanner: false,
    );
  }
}

