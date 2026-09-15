/// Tests for order history and live tracking.
///
/// The polling tests run inside `testWidgets` so the 15-second timer runs on
/// fake time: `tester.pump(duration)` moves the clock, and a count of HTTP
/// calls shows whether the screen kept watching an order it should have
/// stopped watching. That is the failure worth catching — a delivered order
/// polled forever costs every customer data for nothing.
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:lokshineats_customer/core/network/api_client.dart';
import 'package:lokshineats_customer/core/providers.dart';
import 'package:lokshineats_customer/core/theme/app_theme.dart';
import 'package:lokshineats_customer/features/auth/providers/auth_providers.dart';
import 'package:lokshineats_customer/features/orders/models/order.dart';
import 'package:lokshineats_customer/features/orders/pages/your_orders_page.dart';
import 'package:lokshineats_customer/features/orders/providers/checkout_providers.dart';
import 'package:lokshineats_customer/features/orders/providers/order_tracking_providers.dart';

Map<String, dynamic> orderJson({
  String id = 'order-1',
  String status = 'preparing',
  String createdAt = '2026-09-15T18:12:00.000Z',
}) {
  return {
    'id': id,
    'status': status,
    'paymentStatus': 'pending',
    'paymentMethod': 'cash',
    'storeId': 'seed-store',
    'storeName': 'Mama Ntuli Kota Corner',
    'items': [
      {
        'productId': 'seed-kota',
        'name': 'Full House Kota',
        'price': 45.5,
        'quantity': 2,
        'specialInstructions': 'No polony',
        'lineTotal': 91,
      },
    ],
    'subtotal': 91,
    'deliveryFee': 20,
    'total': 111,
    'deliveryCode': '482913',
    'deliveryVerified': false,
    'driverId': null,
    'deliveryAddress': {
      'street': '88 Ndaba Street',
      'city': 'Meadowlands',
      'postalCode': '1852',
    },
    'createdAt': createdAt,
    'updatedAt': createdAt,
    'deliveredAt': null,
  };
}

http.Response _json(int status, Object body) => http.Response(
  jsonEncode(body),
  status,
  headers: {'content-type': 'application/json'},
);

ApiClient _client(http.Client http) => ApiClient(
  httpClient: http,
  baseUrl: 'http://api.test',
  tokenProvider: () async => 'test-id-token',
);

void main() {
  group('order model', () {
    test('reads every status the server can send', () {
      const wire = {
        'pending': OrderStatus.pending,
        'confirmed': OrderStatus.confirmed,
        'preparing': OrderStatus.preparing,
        'ready': OrderStatus.ready,
        'picked_up': OrderStatus.pickedUp,
        'delivered': OrderStatus.delivered,
        'cancelled': OrderStatus.cancelled,
      };

      for (final entry in wire.entries) {
        expect(OrderStatus.fromWire(entry.key), entry.value, reason: entry.key);
      }
    });

    test('an unknown status reads as placed rather than crashing', () {
      // Matches the server's own serialiser fallback.
      expect(OrderStatus.fromWire('teleported'), OrderStatus.pending);
      expect(OrderStatus.fromWire(null), OrderStatus.pending);
    });

    test('only delivered and cancelled orders stop being active', () {
      final inactive = OrderStatus.values
          .where((status) => !status.isActive)
          .toSet();

      expect(inactive, {OrderStatus.delivered, OrderStatus.cancelled});
    });

    test('reads items, dates and the delivery code', () {
      final order = CustomerOrder.fromJson(orderJson());

      expect(order.items.single.name, 'Full House Kota');
      expect(order.items.single.lineTotal, 91);
      expect(order.items.single.specialInstructions, 'No polony');
      expect(order.itemSummary, '2 × Full House Kota');
      expect(order.itemCount, 2);
      expect(order.createdAt?.toUtc(), DateTime.utc(2026, 9, 15, 18, 12));
      expect(order.deliveryCode, '482913');
      expect(order.driverId, isNull);
    });
  });

  group('order history', () {
    test('asks for the caller\'s own orders, authenticated, with a cursor',
        () async {
      final requests = <http.BaseRequest>[];

      final container = ProviderContainer(
        overrides: [
          apiClientProvider.overrideWithValue(
            _client(
              MockClient((request) async {
                requests.add(request);
                return _json(200, {
                  'data': [orderJson()],
                  'nextCursor': 'cursor-2',
                });
              }),
            ),
          ),
        ],
      );
      addTearDown(container.dispose);

      final page = await container
          .read(orderRepositoryProvider)
          .fetchMyOrders(cursor: 'cursor-1', limit: 10);

      final request = requests.single;
      expect(request.url.path, '/api/v1/orders/mine');
      expect(request.url.queryParameters, {'limit': '10', 'cursor': 'cursor-1'});
      expect(request.headers['Authorization'], 'Bearer test-id-token');
      expect(page.orders.single.id, 'order-1');
      expect(page.nextCursor, 'cursor-2');
    });

    testWidgets('lists orders in progress apart from past ones', (
      tester,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            isSignedInProvider.overrideWithValue(true),
            apiClientProvider.overrideWithValue(
              _client(
                MockClient((request) async {
                  return _json(200, {
                    'data': [
                      orderJson(id: 'on-its-way', status: 'picked_up'),
                      orderJson(id: 'last-week', status: 'delivered'),
                    ],
                    'nextCursor': null,
                  });
                }),
              ),
            ),
          ],
          child: MaterialApp(
            theme: AppTheme.light,
            home: const YourOrdersPage(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('In progress'), findsOneWidget);
      expect(find.text('Past orders'), findsOneWidget);
      expect(find.text('On the way'), findsOneWidget);
      expect(find.text('Delivered'), findsOneWidget);

      // The active order is listed first.
      final inProgressY = tester.getTopLeft(find.text('In progress')).dy;
      final pastY = tester.getTopLeft(find.text('Past orders')).dy;
      expect(inProgressY, lessThan(pastY));

      // No "show older" button when the server says there is nothing more.
      expect(find.text('Show older orders'), findsNothing);
    });

    testWidgets('asks a signed-out customer to sign in', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [isSignedInProvider.overrideWithValue(false)],
          child: MaterialApp(
            theme: AppTheme.light,
            home: const YourOrdersPage(),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Sign in to see your orders'), findsOneWidget);
    });
  });

  group('live tracking', () {
    testWidgets('keeps polling an active order and stops once it is delivered',
        (tester) async {
      final statuses = ['preparing', 'picked_up', 'delivered'];
      var calls = 0;

      final container = ProviderContainer(
        overrides: [
          apiClientProvider.overrideWithValue(
            _client(
              MockClient((request) async {
                final status = statuses[calls.clamp(0, statuses.length - 1)];
                calls++;
                return _json(200, {'data': orderJson(status: status)});
              }),
            ),
          ),
        ],
      );
      addTearDown(container.dispose);

      // Something has to be watching, or an autoDispose provider is torn down
      // straight away — exactly as it is when a customer leaves the screen.
      final subscription = container.listen(
        orderTrackingProvider('order-1'),
        (_, _) {},
      );
      addTearDown(subscription.close);

      await tester.pump();
      await tester.pump();
      expect(calls, 1);
      expect(
        container.read(orderTrackingProvider('order-1')).value?.order.status,
        OrderStatus.preparing,
      );

      await tester.pump(OrderTrackingNotifier.pollInterval);
      await tester.pump();
      expect(calls, 2);
      expect(
        container.read(orderTrackingProvider('order-1')).value?.order.status,
        OrderStatus.pickedUp,
      );

      await tester.pump(OrderTrackingNotifier.pollInterval);
      await tester.pump();
      expect(calls, 3);
      expect(
        container.read(orderTrackingProvider('order-1')).value?.order.status,
        OrderStatus.delivered,
      );

      // A minute later: nothing. A delivered order will not change again.
      await tester.pump(const Duration(minutes: 1));
      expect(calls, 3);
    });

    testWidgets('a failed refresh keeps the last order on screen', (
      tester,
    ) async {
      var calls = 0;

      final container = ProviderContainer(
        overrides: [
          apiClientProvider.overrideWithValue(
            _client(
              MockClient((request) async {
                calls++;
                if (calls == 1) {
                  return _json(200, {'data': orderJson(status: 'picked_up')});
                }
                return _json(503, {
                  'error': {'code': 'internal', 'message': 'Try again soon.'},
                });
              }),
            ),
          ),
        ],
      );
      addTearDown(container.dispose);

      final subscription = container.listen(
        orderTrackingProvider('order-1'),
        (_, _) {},
      );
      addTearDown(subscription.close);

      await tester.pump();
      await tester.pump();

      await tester.pump(OrderTrackingNotifier.pollInterval);
      await tester.pump();

      final tracking = container.read(orderTrackingProvider('order-1'));
      expect(tracking.hasError, isFalse);
      expect(tracking.value?.refreshFailed, isTrue);
      // The code is still there — the moment the signal drops is not the
      // moment the customer should lose it.
      expect(tracking.value?.order.deliveryCode, '482913');

      // And it keeps trying.
      await tester.pump(OrderTrackingNotifier.pollInterval);
      await tester.pump();
      expect(calls, 3);

      // Leaving the screen stops the polling, even though the order is still
      // on its way. Nobody is looking, so nothing should be fetched.
      subscription.close();
      await tester.pump();
      await tester.pump(const Duration(minutes: 1));
      expect(calls, 3);
    });

    testWidgets('an order that fails to load the first time is an error', (
      tester,
    ) async {
      final container = ProviderContainer(
        overrides: [
          apiClientProvider.overrideWithValue(
            _client(
              MockClient((request) async {
                return _json(404, {
                  'error': {'code': 'not_found', 'message': 'No such order.'},
                });
              }),
            ),
          ),
        ],
      );
      addTearDown(container.dispose);

      final subscription = container.listen(
        orderTrackingProvider('nope'),
        (_, _) {},
      );
      addTearDown(subscription.close);

      await tester.pump();
      await tester.pump();

      expect(container.read(orderTrackingProvider('nope')).hasError, isTrue);
    });
  });
}
