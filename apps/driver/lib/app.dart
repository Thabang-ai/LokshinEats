/// The application shell.
///
/// Kept apart from `main.dart` so widget tests can mount the app without the
/// startup side effects in the entry point.
library;

import 'package:flutter/material.dart';

import 'package:lokshineats_core/theme/app_theme.dart';

import 'features/shell/pages/driver_home_page.dart';

class LokshinEatsDriverApp extends StatelessWidget {
  const LokshinEatsDriverApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'LokshinEats Driver',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      // Follows the device. A driver working at night gets the dark scheme
      // without having to find a setting.
      themeMode: ThemeMode.system,
      home: const DriverHomePage(),
    );
  }
}
