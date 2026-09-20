/// LokshinEats - vendor app.
///
/// The app a kitchen runs its service from: take orders, cook them, hand them
/// to a driver. It talks to the LokshinEats REST API in `server/` and to
/// nothing else - no Firestore, no mock data.
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

  AppConfig.assertConfigured();

  await FirebaseBootstrap.initialise(
    options: DefaultFirebaseOptions.currentPlatform,
  );

  runApp(
    ProviderScope(
      overrides: [
        // Note what is NOT overridden: the sign-up role. There is no way to
        // ask the API to make you a vendor, by design - an account becomes a
        // vendor by registering a kitchen, which is the screen that follows
        // sign-up here. So this app signs people up as ordinary accounts and
        // promotes them the only way the API allows.
        authCopyProvider.overrideWithValue(
          const AuthCopy(
            signIn: 'Sign in to run your kitchen.',
            signUp: 'Start taking orders from your kitchen.',
          ),
        ),
      ],
      child: const LokshinEatsVendorApp(),
    ),
  );
}
