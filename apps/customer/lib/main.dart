/// LokshinEats — customer app.
///
/// Talks to the LokshinEats REST API in `server/`. There is no mock data
/// anywhere in this app: every screen shows what the API returns, and an
/// empty database looks empty rather than looking populated.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/config/app_config.dart';
import 'core/firebase/firebase_bootstrap.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Catches a release build that was never pointed at a real API, which would
  // otherwise look like a network outage to every customer.
  AppConfig.assertConfigured();

  // Firebase supplies the ID token every authenticated API call carries, so
  // it has to be up before the first request rather than lazily on sign-in.
  await FirebaseBootstrap.initialise();

  runApp(const ProviderScope(child: LokshinEatsApp()));
}
