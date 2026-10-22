/// The application shell.
///
/// Kept apart from `main.dart` so widget tests can mount the app without the
/// startup side effects in the entry point.
library;

import 'package:flutter/material.dart';

import 'package:lokshineats_core/theme/app_theme.dart';
import 'features/notifications/push/push_listener.dart';
import 'features/shell/pages/home_shell.dart';

class LokshinEatsApp extends StatelessWidget {
  const LokshinEatsApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      // Reachable from outside this tree, which is where a push arrives from.
      // Inert when nothing uses them, so tests mounting the app need no push.
      navigatorKey: appNavigatorKey,
      scaffoldMessengerKey: appMessengerKey,
      title: 'LokshinEats',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      // Light, like the website. Following the device put customers in a
      // dark app that looked like a different product from the site they
      // ordered on an hour earlier. The dark scheme is still built, for
      // whenever the website grows one.
      themeMode: ThemeMode.light,
      home: const HomeShell(),
    );
  }
}
