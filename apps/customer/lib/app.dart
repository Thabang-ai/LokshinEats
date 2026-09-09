/// The application shell.
///
/// Kept apart from `main.dart` so widget tests can mount the app without the
/// startup side effects in the entry point.
library;

import 'package:flutter/material.dart';

import 'core/theme/app_theme.dart';
import 'features/stores/pages/stores_page.dart';

class LokshinEatsApp extends StatelessWidget {
  const LokshinEatsApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'LokshinEats',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      // Follows the device. Both schemes are built and tested, so there is no
      // reason to force one on someone who has already chosen.
      themeMode: ThemeMode.system,
      home: const StoresPage(),
    );
  }
}
