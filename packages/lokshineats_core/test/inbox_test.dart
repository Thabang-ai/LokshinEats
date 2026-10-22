/// The inbox, shared by all three apps.
///
/// It exists so that a notification is visible whether or not push is turned
/// on: with push off - which is how production runs - this is the only place
/// a kitchen can see that an order arrived, or a driver that a delivery is
/// waiting. Those two apps had no inbox at all until it moved here.
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/network/api_client.dart';
import 'package:lokshineats_core/notifications/notification_bell.dart';
import 'package:lokshineats_core/notifications/notifications_page.dart';
import 'package:lokshineats_core/providers.dart';

http.Response _json(int status, Object body) => http.Response(
  jsonEncode(body),
  status,
  headers: const {'content-type': 'application/json'},
);

Map<String, Object?> note({
  String id = 'n1',
  String kind = 'order_placed',
  String title = 'New order',
  String body = '2 items, R74.97. Accept it to start cooking.',
  String? orderId = 'order-1',
  String? readAt,
}) => {
  'id': id,
  'kind': kind,
  'title': title,
  'body': body,
  'orderId': orderId,
  'createdAt': '2026-10-22T16:13:00Z',
  'readAt': readAt,
};

ApiClient clientReturning(
  http.Response Function(http.Request request) respond, {
  List<http.Request>? record,
}) => ApiClient(
  httpClient: MockClient((request) async {
    record?.add(request);
    return respond(request);
  }),
  baseUrl: 'http://api.test',
  tokenProvider: () async => 'test-id-token',
);

Future<void> pumpInbox(
  WidgetTester tester, {
  required Widget home,
  required http.Response Function(http.Request request) respond,
  List<http.Request>? record,
  NotificationTap? onTap,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        isSignedInProvider.overrideWithValue(true),
        apiClientProvider.overrideWithValue(
          clientReturning(respond, record: record),
        ),
        if (onTap != null) notificationTapProvider.overrideWithValue(onTap),
      ],
      child: MaterialApp(home: home),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a kitchen can read what it was told', (tester) async {
    // The whole point of the inbox with push off: the kitchen app shows the
    // notification the API stored when the order was placed.
    await pumpInbox(
      tester,
      home: const NotificationsPage(),
      respond: (_) => _json(200, {
        'data': [note()],
        'meta': {'unread': 1},
      }),
    );

    expect(find.text('New order'), findsOneWidget);
    expect(
      find.text('2 items, R74.97. Accept it to start cooking.'),
      findsOneWidget,
    );
  });

  testWidgets('a driver sees an offer and that it was taken', (tester) async {
    await pumpInbox(
      tester,
      home: const NotificationsPage(),
      respond: (_) => _json(200, {
        'data': [
          note(id: 'n1', kind: 'delivery_available', title: 'Delivery available'),
          note(id: 'n2', kind: 'delivery_taken', title: 'Delivery taken'),
        ],
        'meta': {'unread': 2},
      }),
    );

    expect(find.text('Delivery available'), findsOneWidget);
    expect(find.text('Delivery taken'), findsOneWidget);
  });

  testWidgets('the bell carries the unread count', (tester) async {
    await pumpInbox(
      tester,
      home: const Scaffold(body: Center(child: NotificationBell())),
      respond: (_) => _json(200, {
        'data': [note()],
        'meta': {'unread': 2},
      }),
    );

    expect(find.text('2'), findsOneWidget);
  });

  testWidgets('tapping marks it read and hands the order to the app', (
    tester,
  ) async {
    final requests = <http.Request>[];
    String? opened = 'not called';

    await pumpInbox(
      tester,
      home: const NotificationsPage(),
      record: requests,
      onTap: (context, orderId) => opened = orderId,
      respond: (request) {
        if (request.url.path.endsWith('/read')) {
          return _json(200, {'data': note(readAt: '2026-10-22T16:20:00Z')});
        }
        return _json(200, {
          'data': [note()],
          'meta': {'unread': 1},
        });
      },
    );

    await tester.tap(find.text('New order'));
    await tester.pumpAndSettle();

    expect(opened, 'order-1');
    expect(
      requests.any((r) => r.url.path.endsWith('/read')),
      isTrue,
      reason: 'tapping marks it read',
    );
  });

  testWidgets('an app with nowhere to go is not broken by a tap', (
    tester,
  ) async {
    // The default handler does nothing, which is right for the kitchen app:
    // the queue is already the screen the work lives on.
    await pumpInbox(
      tester,
      home: const NotificationsPage(),
      respond: (request) => request.url.path.endsWith('/read')
          ? _json(200, {'data': note(readAt: '2026-10-22T16:20:00Z')})
          : _json(200, {
              'data': [note()],
              'meta': {'unread': 1},
            }),
    );

    await tester.tap(find.text('New order'));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
  });
}
