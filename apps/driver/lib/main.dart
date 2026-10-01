/// LokshinEats - driver app.
///
/// The app a driver works from: claim a delivery, collect it, hand it over.
/// It talks to the LokshinEats REST API in `server/` and to nothing else —
/// no Firestore, no mock data. What a driver may see and do is decided by the
/// API from their role, not by which screens this app happens to show.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/config/app_config.dart';
import 'package:lokshineats_core/firebase/firebase_bootstrap.dart';

import 'app.dart';
import 'firebase_options.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Catches a release build that was never pointed at a real API, which would
  // otherwise look like a network outage to every driver.
  AppConfig.assertConfigured();

  // Firebase supplies the ID token every authenticated API call carries, so
  // it has to be up before the first request rather than lazily on sign-in.
  await FirebaseBootstrap.initialise(
    options: DefaultFirebaseOptions.currentPlatform,
  );

  runApp(
    ProviderScope(
      overrides: [
        // Anyone who signs up in this app is signing up to deliver. The API
        // only accepts `customer` or `driver` from the account itself, so this
        // is a choice between those two and not a way to grant anything.
        signUpRoleProvider.overrideWithValue('driver'),
        authCopyProvider.overrideWithValue(
          const AuthCopy(
            signIn: 'Sign in to pick up deliveries.',
            signUp: 'Deliver for kitchens near you.',
          ),
        ),
      ],
      child: const LokshinEatsDriverApp(),
    ),
  );
}
