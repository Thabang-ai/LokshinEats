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

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  // Catches a release build that was never pointed at a real API, which would
  // otherwise look like a network outage to every customer.
  AppConfig.assertConfigured();

  runApp(const ProviderScope(child: LokshinEatsApp()));
}
