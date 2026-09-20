/// The application shell.
///
/// Kept apart from `main.dart` so widget tests can mount the app without the
/// startup side effects in the entry point.
library;

import 'package:flutter/material.dart';

import 'package:lokshineats_core/theme/app_theme.dart';

import 'features/shell/pages/vendor_home_page.dart';

class LokshinEatsVendorApp extends StatelessWidget {
  const LokshinEatsVendorApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'LokshinEats Kitchen',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: ThemeMode.system,
      home: const VendorHomePage(),
    );
  }
}
