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

  /// Whether [apiBaseUrl] points at this machine.
  static bool get isLocalApi =>
      apiBaseUrl.contains('localhost') ||
      apiBaseUrl.contains('127.0.0.1') ||
      apiBaseUrl.contains('10.0.2.2');

  /// Fail fast on a release build that was never pointed at a real API.
  ///
  /// Shipping a store build that silently talks to localhost would look like a
  /// network outage to every customer, so it is worth crashing at startup
  /// instead — in debug this is a no-op.
  static void assertConfigured() {
    assert(() {
      if (isRelease && isLocalApi) {
        throw StateError(
          'API_BASE_URL is still $apiBaseUrl in a release build. Pass '
          '--dart-define=API_BASE_URL=https://your-api-host',
        );
      }
      return true;
    }());
  }
}
