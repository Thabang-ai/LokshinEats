/// The application shell.
///
/// Kept apart from `main.dart` so widget tests can mount the app without the
/// startup side effects in the entry point.
library;

import 'package:flutter/material.dart';

import 'package:lokshineats_core/push/push_listener.dart';
import 'package:lokshineats_core/theme/app_theme.dart';

import 'features/shell/pages/vendor_home_page.dart';

class LokshinEatsVendorApp extends StatelessWidget {
  const LokshinEatsVendorApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      // Reachable from outside this tree, which is where a push arrives
      // from. Inert when nothing uses them.
      navigatorKey: appNavigatorKey,
      scaffoldMessengerKey: appMessengerKey,
      title: 'LokshinEats Kitchen',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      // Light, like the website, so all three apps and the site look like one
      // product. The dark scheme is still built for whenever the site grows
      // one.
      themeMode: ThemeMode.light,
      home: const VendorHomePage(),
    );
  }
}
