/// Build-time configuration.
///
/// Values come from `--dart-define`, so a release build is pinned to whatever
/// it was compiled against and cannot be repointed at another environment at
/// runtime. Same reasoning as the web app's `NEXT_PUBLIC_` variables.
///
/// Local development:
///   flutter run --dart-define=API_BASE_URL=http://localhost:4000
///
/// On an Android emulator the host machine is 10.0.2.2, not localhost:
///   flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000
library;

class AppConfig {
  const AppConfig._();

  /// Base URL of the LokshinEats REST API (see `server/`).
  ///
  /// Defaults to a local API so a fresh checkout runs without arguments. A
  /// release build must override it — see [assertConfigured].
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:4000',
  );

  /// True when the app is compiled in release mode.
  static const bool isRelease = bool.fromEnvironment('dart.vm.product');

  /// Point Firebase Auth at the local emulator instead of the live project.
  ///
  /// Compile-time, so a release build physically cannot be switched to it:
  ///   flutter run --dart-define=USE_FIREBASE_EMULATORS=true
  ///
  /// The API must be pointed at the same emulators, or the tokens minted here
  /// will not verify against the live project it is checking them with.
  static const bool useFirebaseEmulators = bool.fromEnvironment(
    'USE_FIREBASE_EMULATORS',
  );

  /// Host the emulators are reachable on. `10.0.2.2` on an Android emulator.
  static const String emulatorHost = String.fromEnvironment(
    'EMULATOR_HOST',
    defaultValue: 'localhost',
  );

  /// Matches the `auth` port in `firebase.json`.
  static const int authEmulatorPort = 9099;

  /// The web push certificate key (VAPID) from the Firebase console, needed
  /// for push notifications in a browser:
  ///   `flutter build web --dart-define=FCM_VAPID_KEY=YOUR_KEY`
  ///
  /// Empty by default, in which case a web build does not ask for push at
  /// all and the in-app inbox is the notification. Phones do not need it.
  static const String fcmVapidKey = String.fromEnvironment('FCM_VAPID_KEY');

  /// A release build made to run on this machine, against the local API and
  /// emulators - how the web builds are tested locally, since a debug web
  /// build is too slow to load. Never pass it to a build that ships:
  ///   flutter build web --dart-define=LOCAL_RELEASE_BUILD=true ...
  static const bool localReleaseBuild = bool.fromEnvironment(
    'LOCAL_RELEASE_BUILD',
  );

  /// Whether [apiBaseUrl] points at this machine.
  static bool get isLocalApi => pointsAtThisMachine(apiBaseUrl);

  static bool pointsAtThisMachine(String url) =>
      url.contains('localhost') ||
      url.contains('127.0.0.1') ||
      url.contains('10.0.2.2');

  /// Fail fast on a release build that was never pointed at a real API.
  ///
  /// Shipping a store build that silently talks to localhost would look like a
  /// network outage to every customer, so it is worth crashing at startup
  /// instead — in debug this is a no-op.
  ///
  /// Deliberately not an `assert`: release builds strip asserts, so the check
  /// would vanish from the only builds it exists for.
  static void assertConfigured() {
    final problem = releaseProblem(
      isRelease: isRelease,
      apiBaseUrl: apiBaseUrl,
      useFirebaseEmulators: useFirebaseEmulators,
      localReleaseBuild: localReleaseBuild,
    );
    if (problem != null) throw StateError(problem);
  }

  /// Why a build with these settings must not start, or null if it may.
  static String? releaseProblem({
    required bool isRelease,
    required String apiBaseUrl,
    required bool useFirebaseEmulators,
    bool localReleaseBuild = false,
  }) {
    if (!isRelease || localReleaseBuild) return null;
    if (pointsAtThisMachine(apiBaseUrl)) {
      return 'API_BASE_URL is still $apiBaseUrl in a release build. Pass '
          '--dart-define=API_BASE_URL=https://your-api-host';
    }
    if (useFirebaseEmulators) {
      return 'A release build must not use the Firebase emulators. Drop '
          '--dart-define=USE_FIREBASE_EMULATORS=true';
    }
    return null;
  }
}
