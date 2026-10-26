/// LokshinEats - driver app.
///
/// The app a driver works from: claim a delivery, collect it, hand it over.
/// It talks to the LokshinEats REST API in `server/` and to nothing else —
/// no Firestore, no mock data. What a driver may see and do is decided by the
/// API from their role, not by which screens this app happens to show.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/push/push_listener.dart';
import 'package:lokshineats_core/push/push_messaging.dart';
import 'package:lokshineats_core/push/push_registration.dart';
import 'package:lokshineats_core/config/startup.dart';

import 'features/orders/push_routing.dart';
import 'app.dart';
import 'firebase_options.dart';

Future<void> main() async {
  // Checks the build was pointed at a real API and brings Firebase up. A
  // build that cannot start says why on screen rather than showing a driver
  // a black one.
  await startLokshinEats(
    options: DefaultFirebaseOptions.currentPlatform,
    app: () => ProviderScope(
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
        // Before signing out, stop pushing deliveries to this phone - a
        // shared phone should not go on receiving another driver's work.
        signOutCleanupProvider.overrideWith(
          (ref) =>
              () => ref.read(pushRegistrarProvider).unregister(),
        ),
        pushAppProvider.overrideWithValue(driverPushApp),
        pushArrivedProvider.overrideWith(driverPushArrived),
        pushOpenedProvider.overrideWith(driverPushOpened),
        pushShowsInAppProvider.overrideWithValue(true),
      ],
      child: const PushListener(child: LokshinEatsDriverApp()),
    ),
  );
}
