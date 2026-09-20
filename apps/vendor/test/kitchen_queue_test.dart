/// The kitchen's queue, and the two answers that move money.
///
/// Accepting and marking ready are the kitchen's half of the order lifecycle.
/// Turning an order down and answering a driver's cash handover are the two
/// that cost somebody something, so both say what they mean before they act.
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
import 'package:lokshineats_core/utils/money.dart';

import 'package:lokshineats_vendor/features/orders/models/kitchen_order.dart';
import 'package:lokshineats_vendor/features/orders/pages/order_queue_page.dart';
import 'package:lokshineats_vendor/features/orders/repositories/kitchen_order_repository.dart';
import 'package:lokshineats_vendor/features/store/providers/store_providers.dart';
import 'package:lokshineats_vendor/features/store/repositories/store_repository.dart';

Map<String, dynamic> orderJson({
  String id = 'order-abc123',
  String status = 'pending',
  String paymentMethod = 'yoco',
  String? driverId,
  bool cashGivenToVendor = false,
  bool vendorCashConfirmed = false,
  bool vendorCashDisputed = false,
  String? instructions,
}) => {
  'id': id,
  'status': status,
  'customerName': 'Thabo',
  'customerPhone': '0821234567',
  'driverId': driverId,
  'items': [
    {
      'name': 'Full House Kota',
      'quantity': 2,
      'lineTotal': 179.98,
      'specialInstructions': instructions,
    },
  ],
  'subtotal': 179.98,
  'total': 199.98,
  'vendorPayout': 165.58,
  'paymentMethod': paymentMethod,
  'paymentStatus': paymentMethod == 'cash' ? 'pending' : 'paid',
  'cashGivenToVendor': cashGivenToVendor,
  'vendorCashConfirmed': vendorCashConfirmed,
  'vendorCashDisputed': vendorCashDisputed,
  'cashGivenAmount': cashGivenToVendor ? 179.98 : null,
};

Map<String, dynamic> storeJson({bool isOpen = true}) => {
  'id': 'store-1',
  'name': 'Mama Ntuli Kota Corner',
  'cuisine': 'Kota',
  'address': '12 Vilakazi Street',
  'city': 'Soweto',
  'isOpen': isOpen,
  'deliveryFee': 20,
  'minOrderAmount': 30,
  'deliveryTime': '30-45 min',
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
  group('reading an order as the kitchen', () {
    test('keeps the docket: what to cook, for whom, and what it pays', () {
      final order = KitchenOrder.fromJson(orderJson());

      expect(order.lines.single.name, 'Full House Kota');
      expect(order.lines.single.quantity, 2);
      expect(order.customerName, 'Thabo');
      expect(order.vendorPayout, 165.58);
      expect(order.itemCount, 2);
    });

    test('a special instruction stays with its line', () {
      final order = KitchenOrder.fromJson(orderJson(instructions: 'No chilli'));

      expect(order.lines.single.specialInstructions, 'No chilli');
    });

    test('an unknown status does not crash the app', () {
      expect(
        KitchenOrder.fromJson(orderJson(status: 'teleported')).status,
        KitchenOrderStatus.pending,
      );
    });

    test('cash needs an answer only while nobody has given one', () {
      expect(
        KitchenOrder.fromJson(
          orderJson(status: 'delivered', paymentMethod: 'cash'),
        ).awaitsCashAnswer,
        false,
      );
      expect(
        KitchenOrder.fromJson(
          orderJson(
            status: 'delivered',
            paymentMethod: 'cash',
            cashGivenToVendor: true,
          ),
        ).awaitsCashAnswer,
        true,
      );
      expect(
        KitchenOrder.fromJson(
          orderJson(
            status: 'delivered',
            paymentMethod: 'cash',
            cashGivenToVendor: true,
            vendorCashConfirmed: true,
          ),
        ).awaitsCashAnswer,
        false,
      );
    });
  });

  group('repository', () {
    test('accepting goes straight to preparing, not a confirm step', () async {
      final requests = <http.Request>[];
      final repository = KitchenOrderRepository(
        _client(
          MockClient((request) async {
            requests.add(request);
            return _json(200, {'data': orderJson(status: 'preparing')});
          }),
        ),
      );

      await repository.accept('order-abc123');

      expect(requests.single.method, 'PATCH');
      expect(requests.single.url.path, '/api/v1/orders/order-abc123/status');
      expect(jsonDecode(requests.single.body), {'status': 'preparing'});
    });

    test('marking ready is what puts it in front of drivers', () async {
      final requests = <http.Request>[];
      final repository = KitchenOrderRepository(
        _client(
          MockClient((request) async {
            requests.add(request);
            return _json(200, {'data': orderJson(status: 'ready')});
          }),
        ),
      );

      await repository.markReady('order-abc123');

      expect(jsonDecode(requests.single.body), {'status': 'ready'});
    });

    test('answering the cash handover sends confirm or dispute', () async {
      final requests = <http.Request>[];
      final repository = KitchenOrderRepository(
        _client(
          MockClient((request) async {
            requests.add(request);
            return _json(200, {
              'data': orderJson(
                status: 'delivered',
                paymentMethod: 'cash',
                cashGivenToVendor: true,
                vendorCashConfirmed: true,
              ),
            });
          }),
        ),
      );

      await repository.answerCashHandover('order-abc123', received: true);
      await repository.answerCashHandover('order-abc123', received: false);

      expect(
        requests.first.url.path,
        '/api/v1/orders/order-abc123/cash-receipt',
      );
      expect(jsonDecode(requests.first.body), {'outcome': 'confirm'});
      expect(jsonDecode(requests.last.body), {'outcome': 'dispute'});
    });

    test('the kitchen reads only its own orders', () async {
      final requests = <http.Request>[];
      final repository = KitchenOrderRepository(
        _client(
          MockClient((request) async {
            requests.add(request);
            return _json(200, {'data': <Object>[]});
          }),
        ),
      );

      await repository.fetchOrders();

      expect(requests.single.url.path, '/api/v1/orders/store');
      expect(requests.single.headers['Authorization'], 'Bearer test-id-token');
    });
  });

  group('registering a kitchen', () {
    test(
      'refreshes the token, because it is what grants the vendor role',
      () async {
        var refreshed = 0;
        final repository = StoreRepository(
          _client(
            MockClient(
              (request) async => _json(201, {
                'data': {'id': 'store-1', 'name': 'Mama Ntuli', 'isOpen': true},
                'meta': {'tokenRefreshRequired': true},
              }),
            ),
          ),
          () async => refreshed++,
        );

        await repository.register(
          name: 'Mama Ntuli',
          cuisine: 'Kota',
          address: '12 Vilakazi Street',
          city: 'Soweto',
        );

        // Without this the next call still carries the customer claim and is
        // refused, which looks exactly like a broken app.
        expect(refreshed, 1);
      },
    );

    test('no kitchen yet is an answer, not a failure', () async {
      final repository = StoreRepository(
        _client(
          MockClient(
            (request) async => _json(404, {
              'error': {
                'code': 'not_found',
                'message': 'You have not registered a store yet.',
              },
            }),
          ),
        ),
        () async {},
      );

      expect(await repository.fetchMine(), isNull);
    });

    test('an account that is not a vendor yet is the same answer', () async {
      final repository = StoreRepository(
        _client(
          MockClient(
            (request) async => _json(403, {
              'error': {'code': 'forbidden', 'message': 'Vendors only.'},
            }),
          ),
        ),
        () async {},
      );

      expect(await repository.fetchMine(), isNull);
    });
  });

  group('the queue', () {
    Future<List<http.Request>> pumpQueue(
      WidgetTester tester, {
      required http.Response Function(http.Request request) respond,
      Map<String, dynamic>? store,
    }) async {
      tester.view.physicalSize = const Size(1000, 2600);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final requests = <http.Request>[];

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            isSignedInProvider.overrideWithValue(true),
            // Built here rather than through the real provider, which reaches
            // Firebase for the token refresh and has no Firebase to reach.
            storeRepositoryProvider.overrideWithValue(
              StoreRepository(
                _client(
                  MockClient(
                    (request) async =>
                        _json(200, {'data': store ?? storeJson()}),
                  ),
                ),
                () async {},
              ),
            ),
            apiClientProvider.overrideWithValue(
              _client(
                MockClient((request) async {
                  requests.add(request);
                  return respond(request);
                }),
              ),
            ),
          ],
          child: const MaterialApp(home: Scaffold(body: OrderQueuePage())),
        ),
      );
      await tester.pumpAndSettle();
      return requests;
    }

    testWidgets('a new order can be accepted or turned down, nothing else', (
      tester,
    ) async {
      await pumpQueue(
        tester,
        respond: (_) => _json(200, {
          'data': [orderJson()],
        }),
      );

      expect(find.text('New'), findsOneWidget);
      expect(find.text('Accept and start cooking'), findsOneWidget);
      expect(find.text('Turn down'), findsOneWidget);
      expect(find.text('Food is ready'), findsNothing);
    });

    testWidgets('accepting moves the ticket without waiting for a poll', (
      tester,
    ) async {
      final requests = await pumpQueue(
        tester,
        respond: (request) => request.method == 'PATCH'
            ? _json(200, {'data': orderJson(status: 'preparing')})
            : _json(200, {
                'data': [orderJson()],
              }),
      );

      await tester.tap(find.text('Accept and start cooking'));
      await tester.pumpAndSettle();

      expect(requests.last.method, 'PATCH');
      expect(find.text('Cooking'), findsOneWidget);
      expect(find.text('Food is ready'), findsOneWidget);
    });

    testWidgets('what the customer asked for is on the ticket', (tester) async {
      await pumpQueue(
        tester,
        respond: (_) => _json(200, {
          'data': [orderJson(instructions: 'No chilli, extra cheese')],
        }),
      );

      expect(find.text('No chilli, extra cheese'), findsOneWidget);
    });

    testWidgets('a ready order nobody has claimed says it is waiting', (
      tester,
    ) async {
      await pumpQueue(
        tester,
        respond: (_) => _json(200, {
          'data': [orderJson(status: 'ready')],
        }),
      );

      expect(find.text('Waiting for a driver to claim it.'), findsOneWidget);
    });

    testWidgets('a ready order with a driver says someone is coming', (
      tester,
    ) async {
      await pumpQueue(
        tester,
        respond: (_) => _json(200, {
          'data': [orderJson(status: 'ready', driverId: 'drv-1')],
        }),
      );

      expect(
        find.text('A driver is on the way to collect it.'),
        findsOneWidget,
      );
    });

    testWidgets('turning down an accepted order says what it costs first', (
      tester,
    ) async {
      final requests = await pumpQueue(
        tester,
        respond: (_) => _json(200, {
          'data': [orderJson(status: 'preparing')],
        }),
      );
      final before = requests.length;

      await tester.tap(find.text('Cancel this order'));
      await tester.pumpAndSettle();

      expect(find.textContaining('full refund'), findsOneWidget);
      expect(find.textContaining('you are paid nothing'), findsOneWidget);

      await tester.tap(find.text('Keep it'));
      await tester.pumpAndSettle();
      expect(requests.length, before);
    });

    testWidgets('a driver claiming to have paid is asked about, not assumed', (
      tester,
    ) async {
      final requests = await pumpQueue(
        tester,
        respond: (request) => request.url.path.endsWith('/cash-receipt')
            ? _json(200, {
                'data': orderJson(
                  status: 'delivered',
                  paymentMethod: 'cash',
                  cashGivenToVendor: true,
                  vendorCashConfirmed: true,
                ),
              })
            : _json(200, {
                'data': [
                  orderJson(
                    status: 'delivered',
                    paymentMethod: 'cash',
                    cashGivenToVendor: true,
                  ),
                ],
              }),
      );

      expect(find.text('Cash to confirm'), findsOneWidget);
      expect(
        find.textContaining(
          'The driver says they paid you '
          '${formatRands(179.98)}',
        ),
        findsOneWidget,
      );

      await tester.tap(find.text('Yes, got it'));
      await tester.pumpAndSettle();

      expect(
        jsonDecode(
          requests.firstWhere((r) => r.url.path.endsWith('/cash-receipt')).body,
        ),
        {'outcome': 'confirm'},
      );
      expect(find.text('Cash to confirm'), findsNothing);
    });

    testWidgets('a closed kitchen is told so, and offered the way out', (
      tester,
    ) async {
      await pumpQueue(
        tester,
        store: storeJson(isOpen: false),
        respond: (_) => _json(200, {'data': <Object>[]}),
      );

      // A kitchen registers closed, so this is the first thing a new vendor
      // sees - and "no orders yet" alone would be a lie about why.
      expect(find.text('Your kitchen is closed'), findsOneWidget);
      expect(find.text('Open the kitchen'), findsOneWidget);
    });

    testWidgets('an open kitchen with no orders is not told it is closed', (
      tester,
    ) async {
      await pumpQueue(tester, respond: (_) => _json(200, {'data': <Object>[]}));

      expect(find.text('No orders yet'), findsOneWidget);
      expect(find.text('You are closed'), findsNothing);
    });

    testWidgets('an empty queue says so rather than looking broken', (
      tester,
    ) async {
      await pumpQueue(tester, respond: (_) => _json(200, {'data': <Object>[]}));

      expect(find.text('No orders yet'), findsOneWidget);
    });
  });
}
