/// The customer's notification inbox and the bell that points at it.
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/network/api_client.dart';
import 'package:lokshineats_core/providers.dart';

import 'package:lokshineats_customer/features/notifications/models/app_notification.dart';
import 'package:lokshineats_customer/features/notifications/pages/notifications_page.dart';
import 'package:lokshineats_customer/features/notifications/repositories/notification_repository.dart';
import 'package:lokshineats_customer/features/notifications/widgets/notification_bell.dart';

Map<String, dynamic> note({
  String id = 'n-1',
  String kind = 'order_on_the_way',
  String? readAt,
  String orderId = 'order-1',
}) => {
  'id': id,
  'kind': kind,
  'title': 'Your order is on the way',
  'body':
      'Your driver will ask for your delivery code. Open the app to see it.',
  'orderId': orderId,
  'createdAt': '2026-09-21T10:00:00.000Z',
  'readAt': readAt,
};

http.Response _json(int status, Object body) => http.Response(
  jsonEncode(body),
  status,
  headers: {'content-type': 'application/json'},
);

ApiClient _client(http.Client inner) => ApiClient(
  httpClient: inner,
  baseUrl: 'http://api.test',
  tokenProvider: () async => 'test-id-token',
);

void main() {
  group('model', () {
    test('reads what the API sends', () {
      final n = AppNotification.fromJson(note());
      expect(n.kind, NotificationKind.orderOnTheWay);
      expect(n.orderId, 'order-1');
      expect(n.isRead, false);
    });

    test('an unknown kind does not crash the app', () {
      expect(
        AppNotification.fromJson(note(kind: 'something_new')).kind,
        NotificationKind.other,
      );
    });
  });

  group('repository', () {
    test('reads the unread count for the whole inbox', () async {
      final repository = NotificationRepository(
        _client(
          MockClient(
            (request) async => _json(200, {
              'data': [note()],
              'meta': {'unread': 7},
            }),
          ),
        ),
      );

      final page = await repository.fetch();
      expect(page.notifications, hasLength(1));
      expect(page.unread, 7);
    });

    test('registers and removes a device by its token', () async {
      final requests = <http.Request>[];
      final repository = NotificationRepository(
        _client(
          MockClient((request) async {
            requests.add(request);
            return http.Response('', 204);
          }),
        ),
      );

      await repository.registerDevice(token: 'tok-123', platform: 'android');
      await repository.removeDevice('tok-123');

      expect(requests[0].url.path, '/api/v1/notifications/devices');
      expect(jsonDecode(requests[0].body), {
        'token': 'tok-123',
        'platform': 'android',
      });
      expect(requests[1].url.path, '/api/v1/notifications/devices/remove');
      expect(jsonDecode(requests[1].body), {'token': 'tok-123'});
    });
  });

  group('screens', () {
    Future<List<http.Request>> pump(
      WidgetTester tester,
      Widget home, {
      required http.Response Function(http.Request request) respond,
    }) async {
      final requests = <http.Request>[];
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            isSignedInProvider.overrideWithValue(true),
            apiClientProvider.overrideWithValue(
              _client(
                MockClient((request) async {
                  requests.add(request);
                  return respond(request);
                }),
              ),
            ),
          ],
          child: MaterialApp(home: home),
        ),
      );
      await tester.pumpAndSettle();
      return requests;
    }

    testWidgets('the bell shows how many are unread', (tester) async {
      await pump(
        tester,
        const Scaffold(body: Center(child: NotificationBell())),
        respond: (_) => _json(200, {
          'data': [note()],
          'meta': {'unread': 3},
        }),
      );

      expect(find.text('3'), findsOneWidget);
      expect(find.byTooltip('Notifications, 3 unread'), findsOneWidget);
    });

    testWidgets('a quiet bell shows no badge', (tester) async {
      await pump(
        tester,
        const Scaffold(body: Center(child: NotificationBell())),
        respond: (_) => _json(200, {
          'data': <Object>[],
          'meta': {'unread': 0},
        }),
      );

      expect(find.byTooltip('Notifications'), findsOneWidget);
      expect(find.text('0'), findsNothing);
    });

    testWidgets('an empty inbox says what will appear in it', (tester) async {
      await pump(
        tester,
        const NotificationsPage(),
        respond: (_) => _json(200, {
          'data': <Object>[],
          'meta': {'unread': 0},
        }),
      );

      expect(find.text('Nothing yet'), findsOneWidget);
    });

    testWidgets('tapping one marks it read and opens its order', (
      tester,
    ) async {
      final requests = await pump(
        tester,
        const NotificationsPage(),
        respond: (request) {
          if (request.url.path == '/api/v1/notifications') {
            return _json(200, {
              'data': [note()],
              'meta': {'unread': 1},
            });
          }
          if (request.url.path.endsWith('/read')) {
            return _json(200, {'data': note(readAt: '2026-09-21T10:05:00Z')});
          }
          // The order screen it opens.
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
        },
      );

      await tester.tap(find.text('Your order is on the way'));
      await tester.pumpAndSettle();

      expect(
        requests.any((r) => r.url.path == '/api/v1/notifications/n-1/read'),
        true,
      );
      expect(requests.any((r) => r.url.path == '/api/v1/orders/order-1'), true);
    });

    testWidgets('mark all read clears the badge without waiting', (
      tester,
    ) async {
      final requests = await pump(
        tester,
        const NotificationsPage(),
        respond: (request) => request.url.path.endsWith('/read-all')
            ? _json(200, {
                'data': {'updated': 2},
              })
            : _json(200, {
                'data': [note(), note(id: 'n-2', kind: 'order_accepted')],
                'meta': {'unread': 2},
              }),
      );

      expect(find.text('Mark all read'), findsOneWidget);
      await tester.tap(find.text('Mark all read'));
      await tester.pump();

      expect(find.text('Mark all read'), findsNothing);
      await tester.pumpAndSettle();
      expect(
        requests.any((r) => r.url.path == '/api/v1/notifications/read-all'),
        true,
      );
    });
  });
}
