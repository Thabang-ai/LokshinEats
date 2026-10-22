/// Registering a device for push, shared by all three apps.
///
/// What is being held to here: a device is registered for whoever is signed
/// in and for the app it is running, a rotated token replaces the old one,
/// signing out stops the pushes, and none of it ever stops someone using the
/// app - a refused permission, a platform with no token, an API that cannot
/// be reached are all survivable.
library;

import 'dart:async';
import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart' show User;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/network/api_client.dart';
import 'package:lokshineats_core/providers.dart';
import 'package:lokshineats_core/push/push_messaging.dart';
import 'package:lokshineats_core/push/push_registration.dart';

class _User extends Fake implements User {
  _User(this.uid);

  @override
  final String uid;
}

/// A push service that does what the test tells it to.
class FakePushMessaging implements PushMessaging {
  FakePushMessaging({
    this.isSupported = true,
    this.granted = true,
    this.token = 'token-1',
    this.tokenThrows = false,
  });

  @override
  final bool isSupported;
  final bool granted;
  final String? token;
  final bool tokenThrows;

  int permissionAsks = 0;
  final refreshes = StreamController<String>.broadcast();

  @override
  String get platform => 'android';

  @override
  Future<bool> requestPermission() async {
    permissionAsks++;
    return granted;
  }

  @override
  Future<String?> getToken() async {
    if (tokenThrows) throw StateError('no APNs token');
    return token;
  }

  @override
  Stream<String> get onTokenRefresh => refreshes.stream;

  @override
  Stream<PushMessage> get onForegroundMessage => const Stream.empty();

  @override
  Stream<PushMessage> get onOpened => const Stream.empty();

  @override
  Future<PushMessage?> initialMessage() async => null;
}

/// Records every device call, and can be told to fail.
({List<Map<String, Object?>> calls, ApiClient client}) api({
  bool failWrites = false,
}) {
  final calls = <Map<String, Object?>>[];

  final client = ApiClient(
    httpClient: MockClient((request) async {
      if (request.url.path.startsWith('/api/v1/notifications/devices')) {
        calls.add({
          'path': request.url.path,
          'body': jsonDecode(request.body) as Object?,
        });
        if (failWrites) return http.Response('boom', 500);
        return http.Response('', 204);
      }
      return http.Response('{}', 200, headers: const {
        'content-type': 'application/json',
      });
    }),
    baseUrl: 'http://api.test',
    tokenProvider: () async => 'test-id-token',
  );

  return (calls: calls, client: client);
}

ProviderContainer containerFor({
  required FakePushMessaging push,
  required ApiClient client,
  PushApp app = PushApp.customer,
  String? uid = 'user-1',
}) {
  final container = ProviderContainer(
    overrides: [
      pushMessagingProvider.overrideWithValue(push),
      apiClientProvider.overrideWithValue(client),
      pushAppProvider.overrideWithValue(app),
      firebaseUserProvider.overrideWith(
        (ref) => Stream.value(uid == null ? null : _User(uid)),
      ),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

Future<void> settle() => Future<void>.delayed(Duration.zero);

void main() {
  group('registering', () {
    test('a signed-in account registers this device, for this app', () async {
      final a = api();
      final push = FakePushMessaging();
      final container = containerFor(push: push, client: a.client, app: PushApp.driver);

      container.read(pushRegistrarProvider).start();
      await container.read(firebaseUserProvider.future);
      await settle();

      expect(a.calls, [
        {
          'path': '/api/v1/notifications/devices',
          'body': {'token': 'token-1', 'platform': 'android', 'app': 'driver'},
        },
      ]);
    });

    test('each app says which it is', () async {
      for (final app in PushApp.values) {
        final a = api();
        final container = containerFor(
          push: FakePushMessaging(),
          client: a.client,
          app: app,
        );

        container.read(pushRegistrarProvider).start();
        await container.read(firebaseUserProvider.future);
        await settle();

        expect(
          (a.calls.single['body']! as Map<String, Object?>)['app'],
          app.wire,
          reason: '${app.name} must register as itself',
        );
      }
    });

    test('nobody signed in, nothing registered', () async {
      final a = api();
      final container = containerFor(
        push: FakePushMessaging(),
        client: a.client,
        uid: null,
      );

      container.read(pushRegistrarProvider).start();
      await container.read(firebaseUserProvider.future);
      await settle();

      expect(a.calls, isEmpty);
    });

    test('refusing permission registers nothing, and is not an error', () async {
      final a = api();
      final push = FakePushMessaging(granted: false);
      final container = containerFor(push: push, client: a.client);

      container.read(pushRegistrarProvider).start();
      await container.read(firebaseUserProvider.future);
      await settle();

      expect(push.permissionAsks, 1);
      expect(a.calls, isEmpty);
    });

    test('a platform that issues no token is survivable', () async {
      // iOS before APNs is configured throws here. The inbox still works, so
      // the app must carry on.
      final a = api();
      final container = containerFor(
        push: FakePushMessaging(tokenThrows: true),
        client: a.client,
      );

      container.read(pushRegistrarProvider).start();
      await container.read(firebaseUserProvider.future);
      await settle();

      expect(a.calls, isEmpty);
    });

    test('a platform without push is never even asked', () async {
      final a = api();
      final push = FakePushMessaging(isSupported: false);
      final container = containerFor(push: push, client: a.client);

      container.read(pushRegistrarProvider).start();
      await settle();

      expect(push.permissionAsks, 0);
      expect(a.calls, isEmpty);
    });

    test('an API that cannot be reached does not take the app down', () async {
      final a = api(failWrites: true);
      final container = containerFor(push: FakePushMessaging(), client: a.client);

      container.read(pushRegistrarProvider).start();
      await container.read(firebaseUserProvider.future);
      await settle();

      // It tried, and the failure was swallowed rather than thrown at startup.
      expect(a.calls, hasLength(1));
    });
  });

  group('a rotated token', () {
    test('is registered in place of the old one', () async {
      final a = api();
      final push = FakePushMessaging();
      final container = containerFor(push: push, client: a.client);

      container.read(pushRegistrarProvider).start();
      await container.read(firebaseUserProvider.future);
      await settle();

      push.refreshes.add('token-2');
      await settle();

      expect(
        a.calls
            .map((c) => (c['body']! as Map<String, Object?>)['token'])
            .toList(),
        ['token-1', 'token-2'],
      );
    });

    test('is ignored once the account has signed out', () async {
      // Otherwise the phone would be re-registered for someone who has left.
      final a = api();
      final push = FakePushMessaging();
      final container = containerFor(push: push, client: a.client);

      container.read(pushRegistrarProvider).start();
      await container.read(firebaseUserProvider.future);
      await settle();
      await container.read(pushRegistrarProvider).unregister();
      a.calls.clear();

      push.refreshes.add('token-3');
      await settle();

      expect(a.calls, isEmpty);
    });
  });

  group('signing out', () {
    test('removes this device, so a shared phone goes quiet', () async {
      final a = api();
      final container = containerFor(push: FakePushMessaging(), client: a.client);

      container.read(pushRegistrarProvider).start();
      await container.read(firebaseUserProvider.future);
      await settle();
      await container.read(pushRegistrarProvider).unregister();

      expect(a.calls.last, {
        'path': '/api/v1/notifications/devices/remove',
        'body': {'token': 'token-1'},
      });
    });

    test('with nothing registered, there is nothing to remove', () async {
      final a = api();
      final container = containerFor(
        push: FakePushMessaging(granted: false),
        client: a.client,
      );

      container.read(pushRegistrarProvider).start();
      await container.read(firebaseUserProvider.future);
      await settle();
      await container.read(pushRegistrarProvider).unregister();

      expect(a.calls, isEmpty);
    });
  });
}
