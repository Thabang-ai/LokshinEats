/// The driver's board and what claiming a delivery does.
///
/// The claim is the part worth guarding: several drivers see the same card,
/// the API settles the race, and a driver who lost has to be told here rather
/// than at a kitchen counter.
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
import 'package:lokshineats_core/theme/app_theme.dart';
import 'package:lokshineats_core/utils/money.dart';

import 'package:lokshineats_driver/features/orders/models/delivery.dart';
import 'package:lokshineats_driver/features/orders/pages/available_deliveries_page.dart';
import 'package:lokshineats_driver/features/orders/repositories/delivery_repository.dart';

Map<String, dynamic> orderJson({
  String id = 'order-1',
  String status = 'preparing',
  String paymentMethod = 'yoco',
  String? driverId,
}) => {
  'id': id,
  'status': status,
  'storeName': 'Mama Ntuli Kota Corner',
  'customerName': 'Thabo',
  'customerPhone': '0821234567',
  'driverId': driverId,
  'deliveryAddress': {
    'street': '12 Vilakazi Street',
    'city': 'Soweto',
    'postalCode': '1804',
    'instructions': 'Blue gate, ring twice',
  },
  'items': [
    {'name': 'Full House Kota', 'quantity': 2},
    {'name': 'Slap Chips', 'quantity': 1},
  ],
  'subtotal': 179.98,
  'deliveryFee': 20,
  'total': 199.98,
  'driverPayout': 17,
  'paymentMethod': paymentMethod,
  'paymentStatus': paymentMethod == 'cash' ? 'pending' : 'paid',
  'estimatedDistanceKm': 3.4,
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
  group('reading an order as a driver', () {
    test('keeps what the driver needs at the door', () {
      final delivery = Delivery.fromJson(orderJson());

      expect(delivery.storeName, 'Mama Ntuli Kota Corner');
      expect(delivery.customerName, 'Thabo');
      expect(delivery.customerPhone, '0821234567');
      expect(delivery.address.oneLine, '12 Vilakazi Street, Soweto, 1804');
      expect(delivery.address.instructions, 'Blue gate, ring twice');
      expect(delivery.driverPayout, 17);
      expect(delivery.itemCount, 3);
      expect(delivery.itemSummary, '2x Full House Kota, 1x Slap Chips');
    });

    test('knows a cash order is money the driver will be carrying', () {
      expect(Delivery.fromJson(orderJson(paymentMethod: 'cash')).isCash, true);
      expect(Delivery.fromJson(orderJson()).isCash, false);
    });

    test('an unknown status does not crash the app', () {
      expect(
        Delivery.fromJson(orderJson(status: 'teleported')).status,
        DeliveryStatus.pending,
      );
    });

    test("a finished delivery is no longer the driver's job", () {
      expect(DeliveryStatus.delivered.isActive, false);
      expect(DeliveryStatus.cancelled.isActive, false);
      expect(DeliveryStatus.pickedUp.isActive, true);
    });
  });

  group('repository', () {
    test('asks the API for unclaimed work, signed in', () async {
      final requests = <http.Request>[];
      final repository = DeliveryRepository(
        _client(
          MockClient((request) async {
            requests.add(request);
            return _json(200, {
              'data': [orderJson()],
              'nextCursor': 'page-2',
            });
          }),
        ),
      );

      final page = await repository.fetchAvailable();

      expect(requests.single.url.path, '/api/v1/orders/available');
      expect(requests.single.headers['Authorization'], 'Bearer test-id-token');
      expect(page.deliveries.single.id, 'order-1');
      expect(page.hasMore, true);
    });

    test('claims one by id', () async {
      final requests = <http.Request>[];
      final repository = DeliveryRepository(
        _client(
          MockClient((request) async {
            requests.add(request);
            return _json(200, {'data': orderJson(driverId: 'drv-1')});
          }),
        ),
      );

      final claimed = await repository.accept('order-1');

      expect(requests.single.method, 'POST');
      expect(requests.single.url.path, '/api/v1/orders/order-1/accept');
      expect(claimed.isUnclaimed, false);
    });

    test('reads its own deliveries from the assigned list', () async {
      final requests = <http.Request>[];
      final repository = DeliveryRepository(
        _client(
          MockClient((request) async {
            requests.add(request);
            return _json(200, {'data': <Object>[]});
          }),
        ),
      );

      await repository.fetchMine();

      expect(requests.single.url.path, '/api/v1/orders/assigned');
    });
  });

  group('the available board', () {
    Future<List<http.Request>> pumpBoard(
      WidgetTester tester, {
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
          child: MaterialApp(
            theme: AppTheme.light,
            home: const Scaffold(body: AvailableDeliveriesPage()),
          ),
        ),
      );
      await tester.pumpAndSettle();
      return requests;
    }

    testWidgets('shows what is going, and what it pays', (tester) async {
      await pumpBoard(
        tester,
        respond: (_) => _json(200, {
          'data': [orderJson()],
        }),
      );

      expect(find.text('Mama Ntuli Kota Corner'), findsOneWidget);
      expect(find.text(formatRands(17)), findsOneWidget);
      expect(find.text('You earn'), findsOneWidget);
      expect(find.textContaining('12 Vilakazi Street'), findsOneWidget);
      expect(find.text('Claim this delivery'), findsOneWidget);
    });

    testWidgets('says a ready order is a collection, not a claim', (
      tester,
    ) async {
      await pumpBoard(
        tester,
        respond: (_) => _json(200, {
          'data': [orderJson(status: 'ready')],
        }),
      );

      expect(find.text('Collect this order'), findsOneWidget);
      expect(find.text('Ready to collect'), findsOneWidget);
    });

    testWidgets('warns that a cash order is money to collect', (tester) async {
      await pumpBoard(
        tester,
        respond: (_) => _json(200, {
          'data': [orderJson(paymentMethod: 'cash')],
        }),
      );

      expect(find.text('Collect ${formatRands(199.98)} cash'), findsOneWidget);
    });

    testWidgets('an empty board says so rather than looking broken', (
      tester,
    ) async {
      await pumpBoard(tester, respond: (_) => _json(200, {'data': <Object>[]}));

      expect(find.text('No deliveries going right now'), findsOneWidget);
    });

    testWidgets('claiming tells the driver where to go', (tester) async {
      final requests = await pumpBoard(
        tester,
        respond: (request) => request.method == 'POST'
            ? _json(200, {'data': orderJson(driverId: 'drv-1')})
            : _json(200, {
                'data': [orderJson()],
              }),
      );

      await tester.tap(find.text('Claim this delivery'));
      await tester.pumpAndSettle();

      expect(
        requests.any((r) => r.url.path == '/api/v1/orders/order-1/accept'),
        true,
      );
      expect(
        find.textContaining('Head to Mama Ntuli Kota Corner'),
        findsOneWidget,
      );
    });

    testWidgets('claiming a ready order says it has been collected', (
      tester,
    ) async {
      await pumpBoard(
        tester,
        respond: (request) => request.method == 'POST'
            // The API moves a ready order straight to picked up.
            ? _json(200, {
                'data': orderJson(status: 'picked_up', driverId: 'drv-1'),
              })
            : _json(200, {
                'data': [orderJson(status: 'ready')],
              }),
      );

      await tester.tap(find.text('Collect this order'));
      await tester.pumpAndSettle();

      expect(find.textContaining('Collected from'), findsOneWidget);
      expect(
        find.textContaining('Deliver to 12 Vilakazi Street'),
        findsOneWidget,
      );
    });

    testWidgets(
      'losing the race says who took it, and is not an error screen',
      (tester) async {
        await pumpBoard(
          tester,
          respond: (request) => request.method == 'POST'
              ? _json(409, {
                  'error': {
                    'code': 'conflict',
                    'message': 'Another driver has already taken this order.',
                  },
                })
              : _json(200, {
                  'data': [orderJson()],
                }),
        );

        await tester.tap(find.text('Claim this delivery'));
        await tester.pumpAndSettle();

        expect(
          find.text('Another driver has already taken this order.'),
          findsOneWidget,
        );
        // Still a usable board, not a crash.
        expect(find.text('Mama Ntuli Kota Corner'), findsOneWidget);
      },
    );
  });
}
