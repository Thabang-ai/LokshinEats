/// Push: keeping the API told which phone to buzz, and what a push does.
library;

import 'dart:async';
import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart' show User;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/network/api_client.dart';
import 'package:lokshineats_core/providers.dart';

import 'package:lokshineats_customer/features/notifications/push/push_listener.dart';
import 'package:lokshineats_customer/features/notifications/push/push_messaging.dart';
import 'package:lokshineats_customer/features/notifications/push/push_registration.dart';

class _User extends Fake implements User {
  @override
  String get uid => 'cust-1';
}

/// A push service that does what the test tells it to.
class FakePushMessaging implements PushMessaging {
  FakePushMessaging({
    this.isSupported = true,
    this.granted = true,
    this.token = 'token-1',
  });

  @override
  final bool isSupported;
  final bool granted;
  final String? token;

  int permissionAsks = 0;
  final refreshes = StreamController<String>.broadcast();
  final foreground = StreamController<PushMessage>.broadcast();
  final opened = StreamController<PushMessage>.broadcast();

  @override
  String get platform => 'android';

  @override
  Future<bool> requestPermission() async {
    permissionAsks++;
    return granted;
  }

  @override
  Future<String?> getToken() async => token;

  @override
  Stream<String> get onTokenRefresh => refreshes.stream;

  @override
  Stream<PushMessage> get onForegroundMessage => foreground.stream;

  @override
  Stream<PushMessage> get onOpened => opened.stream;

  @override
  Future<PushMessage?> initialMessage() async => null;
}

http.Response _json(int status, Object body) => http.Response(
  jsonEncode(body),
  status,
  headers: {'content-type': 'application/json'},
);

/// The API the app talks to: records what it is asked, answers plausibly.
({List<http.Request> requests, ApiClient client}) _api() {
  final requests = <http.Request>[];
  final client = ApiClient(
    httpClient: MockClient((request) async {
      requests.add(request);
      if (request.url.path.startsWith('/api/v1/notifications/devices')) {
        return http.Response('', 204);
      }
      if (request.url.path == '/api/v1/notifications') {
        return _json(200, {
          'data': <Object>[],
          'meta': {'unread': 0},
        });
      }
      return _json(200, {
        'data': {
          'id': 'order-1',
          'status': 'picked_up',
          'storeName': 'Mama Ntuli',
          'paymentMethod': 'cash',
          'paymentStatus': 'pending',
          'subtotal': 100,
          'deliveryFee': 20,
          'total': 120,
          'items': <Object>[],
        },
      });
    }),
    baseUrl: 'http://api.test',
    tokenProvider: () async => 'test-id-token',
  );
  return (requests: requests, client: client);
}

List<Map<String, dynamic>> _deviceCalls(List<http.Request> requests) => [
  for (final r in requests)
    if (r.url.path.startsWith('/api/v1/notifications/devices'))
      {'path': r.url.path, 'body': jsonDecode(r.body)},
];

void main() {
  group('registering this device', () {
    ProviderContainer container(FakePushMessaging push, ApiClient client) {
      final c = ProviderContainer(
        overrides: [
          pushMessagingProvider.overrideWithValue(push),
          apiClientProvider.overrideWithValue(client),
          firebaseUserProvider.overrideWith((ref) => Stream.value(_User())),
        ],
      );
      addTearDown(c.dispose);
      return c;
    }

    Future<void> settle() => Future<void>.delayed(Duration.zero);

    test('signing in registers the device with its platform', () async {
      final api = _api();
      final c = container(FakePushMessaging(), api.client);

      c.read(pushRegistrarProvider).start();
      await c.read(firebaseUserProvider.future);
      await settle();

      expect(_deviceCalls(api.requests), [
        {
          'path': '/api/v1/notifications/devices',
          'body': {'token': 'token-1', 'platform': 'android'},
        },
      ]);
    });

    test('refusing permission registers nothing', () async {
      final api = _api();
      final push = FakePushMessaging(granted: false);
      final c = container(push, api.client);

      c.read(pushRegistrarProvider).start();
      await c.read(firebaseUserProvider.future);
      await settle();

      expect(push.permissionAsks, 1);
      expect(_deviceCalls(api.requests), isEmpty);
    });

    test('a rotated token is registered again', () async {
      final api = _api();
      final push = FakePushMessaging();
      final c = container(push, api.client);

      c.read(pushRegistrarProvider).start();
      await c.read(firebaseUserProvider.future);
      await settle();

      push.refreshes.add('token-2');
      await settle();

      expect(_deviceCalls(api.requests).map((c) => c['body']['token']), [
        'token-1',
        'token-2',
      ]);
    });

    test('signing out removes the device it registered', () async {
      final api = _api();
      final c = container(FakePushMessaging(), api.client);

      c.read(pushRegistrarProvider).start();
      await c.read(firebaseUserProvider.future);
      await settle();
      await c.read(pushRegistrarProvider).unregister();

      expect(_deviceCalls(api.requests).last, {
        'path': '/api/v1/notifications/devices/remove',
        'body': {'token': 'token-1'},
      });
    });

    test('a platform without push is not asked anything', () async {
      final api = _api();
      final push = FakePushMessaging(isSupported: false);
      final c = container(push, api.client);

      c.read(pushRegistrarProvider).start();
      await settle();

      expect(push.permissionAsks, 0);
      expect(_deviceCalls(api.requests), isEmpty);
    });
  });

  group('what a push does', () {
    Future<({FakePushMessaging push, List<http.Request> requests})> pump(
      WidgetTester tester,
    ) async {
      final api = _api();
      final push = FakePushMessaging();

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            pushMessagingProvider.overrideWithValue(push),
            apiClientProvider.overrideWithValue(api.client),
            isSignedInProvider.overrideWithValue(true),
            firebaseUserProvider.overrideWith((ref) => Stream.value(_User())),
          ],
          child: PushListener(
            child: MaterialApp(
              navigatorKey: appNavigatorKey,
              scaffoldMessengerKey: appMessengerKey,
              home: const Scaffold(body: Text('Home')),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      return (push: push, requests: api.requests);
    }

    testWidgets('arriving while open, it says so and offers the order', (
      tester,
    ) async {
      final app = await pump(tester);

      app.push.foreground.add(
        const PushMessage(
          title: 'Your order is on the way',
          body: 'Open the app to see your code.',
          orderId: 'order-1',
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.text('Your order is on the way. Open the app to see your code.'),
        findsOneWidget,
      );

      await tester.tap(find.text('View'));
      await tester.pumpAndSettle();

      expect(
        app.requests.any((r) => r.url.path == '/api/v1/orders/order-1'),
        true,
      );
    });

    testWidgets('tapped from outside the app, it opens the order', (
      tester,
    ) async {
      final app = await pump(tester);

      app.push.opened.add(
        const PushMessage(title: 'Delivered', body: '', orderId: 'order-1'),
      );
      await tester.pumpAndSettle();

      expect(find.text('Home'), findsNothing);
      expect(
        app.requests.any((r) => r.url.path == '/api/v1/orders/order-1'),
        true,
      );
    });
  });
}
