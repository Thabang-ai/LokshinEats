/// Signing out runs an app's clean-up first, and never gets stuck on it.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/auth/auth_repository.dart';
import 'package:lokshineats_core/providers.dart';

/// Records the order things happen in.
class _RecordingAuth extends Fake implements AuthRepository {
  _RecordingAuth(this.events);

  final List<String> events;

  @override
  Future<void> signOut() async => events.add('signed out');
}

ProviderContainer _container({
  required List<String> events,
  Future<void> Function()? cleanUp,
}) {
  final container = ProviderContainer(
    overrides: [
      authRepositoryProvider.overrideWithValue(_RecordingAuth(events)),
      signOutCleanupProvider.overrideWithValue(cleanUp),
      // Nothing here needs a profile; keep it from reaching Firebase.
      profileProvider.overrideWith((ref) async => null),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

void main() {
  test('the clean-up runs while the session still exists', () async {
    final events = <String>[];
    final container = _container(
      events: events,
      cleanUp: () async => events.add('device removed'),
    );

    await container.read(authControllerProvider.notifier).signOut();

    // The other order would leave the API call with no session to make it.
    expect(events, ['device removed', 'signed out']);
  });

  test('a failing clean-up does not keep anyone signed in', () async {
    final events = <String>[];
    final container = _container(
      events: events,
      cleanUp: () async => throw Exception('API unreachable'),
    );

    await container.read(authControllerProvider.notifier).signOut();

    expect(events, ['signed out']);
  });

  test('an app with nothing to clean up just signs out', () async {
    final events = <String>[];
    final container = _container(events: events);

    await container.read(authControllerProvider.notifier).signOut();

    expect(events, ['signed out']);
  });
}
