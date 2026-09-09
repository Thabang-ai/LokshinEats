/// Firebase initialisation.
///
/// Auth is the only Firebase product this app uses directly. Everything else —
/// orders, payments, wallets — goes through the REST API, which is what keeps
/// the money decisions on a server the customer cannot edit. The app never
/// talks to Firestore.
library;

import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';

import '../config/app_config.dart';
import '../../firebase_options.dart';

class FirebaseBootstrap {
  const FirebaseBootstrap._();

  /// Start Firebase, pointing Auth at the emulator when asked to.
  ///
  /// Safe to call more than once: [Firebase.initializeApp] is idempotent for
  /// the default app, and the emulator is only wired on the first call.
  static Future<void> initialise() async {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );

    if (AppConfig.useFirebaseEmulators) {
      // Local development against the emulator suite: no real accounts are
      // touched, and the API this app calls must be pointed at the same
      // emulators or the tokens it issues will not verify.
      //
      // Known local-only behaviour, measured on 2026-09-09: on web, a session
      // signed in against the Auth emulator is written to IndexedDB and then
      // removed on the next page load, so the customer starts signed out
      // every reload. The SDK begins restoring the persisted user when the
      // Auth instance is created and discards it when the emulator host is
      // switched underneath. Nothing to fix here — this call is already as
      // early as FlutterFire allows — and it does not apply to a build
      // without this flag. Do not go looking for it in the auth code.
      await FirebaseAuth.instance.useAuthEmulator(
        AppConfig.emulatorHost,
        AppConfig.authEmulatorPort,
      );
    }
  }
}
