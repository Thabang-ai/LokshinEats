/// LokshinEats — customer app.
///
/// Talks to the LokshinEats REST API in `server/`. There is no mock data
/// anywhere in this app: every screen shows what the API returns, and an
/// empty database looks empty rather than looking populated.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/config/app_config.dart';
import 'package:lokshineats_core/firebase/firebase_bootstrap.dart';

import 'app.dart';
import 'features/notifications/push/push_listener.dart';
import 'features/notifications/push/push_registration.dart';
import 'firebase_options.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Catches a release build that was never pointed at a real API, which would
  // otherwise look like a network outage to every customer.
  AppConfig.assertConfigured();

  // Firebase supplies the ID token every authenticated API call carries, so
  // it has to be up before the first request rather than lazily on sign-in.
  await FirebaseBootstrap.initialise(
    options: DefaultFirebaseOptions.currentPlatform,
  );

  runApp(
    ProviderScope(
      overrides: [
        authCopyProvider.overrideWithValue(
          const AuthCopy(
            signIn: 'Sign in to order and track deliveries.',
            signUp: 'Order from kitchens near you.',
          ),
        ),
        // Before signing out, stop pushing this account's order updates to
        // this phone - a shared phone should not go on receiving them.
        signOutCleanupProvider.overrideWith(
          (ref) =>
              () => ref.read(pushRegistrarProvider).unregister(),
        ),
      ],
      child: const PushListener(child: LokshinEatsApp()),
    ),
  );
}
