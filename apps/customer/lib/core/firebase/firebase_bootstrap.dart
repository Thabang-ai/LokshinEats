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
      await FirebaseAuth.instance.useAuthEmulator(
        AppConfig.emulatorHost,
        AppConfig.authEmulatorPort,
      );
    }
  }
}
