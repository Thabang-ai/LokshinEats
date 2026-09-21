/// What stops a release build that was never pointed at production.
library;

import 'package:flutter_test/flutter_test.dart';

import 'package:lokshineats_core/config/app_config.dart';

void main() {
  String? problem({
    bool isRelease = true,
    String apiBaseUrl = 'https://lokshineats-api.vercel.app',
    bool useFirebaseEmulators = false,
  }) => AppConfig.releaseProblem(
    isRelease: isRelease,
    apiBaseUrl: apiBaseUrl,
    useFirebaseEmulators: useFirebaseEmulators,
  );

  test('a release build pointed at a real API may start', () {
    expect(problem(), isNull);
  });

  test('a release build still on the local API may not', () {
    for (final url in [
      'http://localhost:4000',
      'http://127.0.0.1:4000',
      'http://10.0.2.2:4000',
    ]) {
      expect(problem(apiBaseUrl: url), contains('API_BASE_URL'), reason: url);
    }
  });

  test('a release build on the Firebase emulators may not', () {
    expect(
      problem(useFirebaseEmulators: true),
      contains('USE_FIREBASE_EMULATORS'),
    );
  });

  test('a release build marked local may use both, for local testing', () {
    expect(
      AppConfig.releaseProblem(
        isRelease: true,
        apiBaseUrl: 'http://localhost:4000',
        useFirebaseEmulators: true,
        localReleaseBuild: true,
      ),
      isNull,
    );
  });

  test('debug builds are left alone', () {
    expect(
      problem(
        isRelease: false,
        apiBaseUrl: 'http://localhost:4000',
        useFirebaseEmulators: true,
      ),
      isNull,
    );
  });
}
