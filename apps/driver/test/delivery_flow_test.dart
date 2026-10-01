/// Working a delivery: collecting it, proving it arrived, settling the cash.
///
/// The rule this screen exists to keep is that a driver is only ever offered
/// what the API would actually allow. Collection comes from the kitchen
/// marking the food ready, the handover is proved by the customer's code, and
/// cash is owed to the kitchen until the kitchen says otherwise.
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:lokshineats_core/network/api_client.dart';
import 'package:lokshineats_core/network/api_exception.dart';
import 'package:lokshineats_core/providers.dart';
import 'package:lokshineats_core/utils/money.dart';

import 'package:lokshineats_driver/features/orders/models/delivery.dart';
import 'package:lokshineats_driver/features/orders/pages/delivery_page.dart';
import 'package:lokshineats_driver/features/orders/repositories/delivery_repository.dart';

Map<String, dynamic> orderJson({
  String status = 'ready',
  String paymentMethod = 'yoco',
  String? driverId = 'drv-1',
  bool cashGivenToVendor = false,
  bool vendorCashConfirmed = false,
  bool vendorCashDisputed = false,
}) => {
  'id': 'order-1',
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
  ],
  'subtotal': 179.98,
  'deliveryFee': 20,
  'total': 199.98,
  'driverPayout': 17,
  'paymentMethod': paymentMethod,
  'paymentStatus': paymentMethod == 'cash' ? 'pending' : 'paid',
  'cashGivenToVendor': cashGivenToVendor,
  'vendorCashConfirmed': vendorCashConfirmed,
  'vendorCashDisputed': vendorCashDisputed,
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
  group('what the driver still owes', () {
    test('cash is owed to the kitchen until it has been handed over', () {
      final delivered = Delivery.fromJson(
        orderJson(status: 'delivered', paymentMethod: 'cash'),
      );

      expect(delivered.owesKitchenCash, true);
      // The food, not the delivery fee - that part is the driver's.
      expect(delivered.kitchenCashDue, 179.98);
    });

    test('nothing is owed once it has been handed over', () {
      final settled = Delivery.fromJson(
        orderJson(
          status: 'delivered',
          paymentMethod: 'cash',
          cashGivenToVendor: true,
        ),
      );

      expect(settled.owesKitchenCash, false);
    });

    test('a card order owes the kitchen nothing at any point', () {
      expect(
        Delivery.fromJson(orderJson(status: 'delivered')).owesKitchenCash,
        false,
      );
    });

    test(
      'an order claimed before the food is ready is waiting on the kitchen',
      () {
        expect(
          Delivery.fromJson(orderJson(status: 'preparing')).isWaitingOnKitchen,
          true,
        );
        expect(
          Delivery.fromJson(orderJson(status: 'confirmed')).isWaitingOnKitchen,
          true,
        );
        expect(
          Delivery.fromJson(orderJson(status: 'ready')).isWaitingOnKitchen,
          false,
        );
      },
    );
  });

  group('repository', () {
    test(
      'collecting asks for picked up, the only move a driver may make',
      () async {
        final requests = <http.Request>[];
        final repository = DeliveryRepository(
          _client(
            MockClient((request) async {
              requests.add(request);
              return _json(200, {'data': orderJson(status: 'picked_up')});
            }),
          ),
        );

        await repository.collect('order-1');

        expect(requests.single.method, 'PATCH');
        expect(requests.single.url.path, '/api/v1/orders/order-1/status');
        expect(jsonDecode(requests.single.body), {'status': 'picked_up'});
      },
    );

    test('confirming sends the code the customer read out', () async {
      final requests = <http.Request>[];
      final repository = DeliveryRepository(
        _client(
          MockClient((request) async {
            requests.add(request);
            return _json(200, {'data': orderJson(status: 'delivered')});
          }),
        ),
      );

      await repository.confirmDelivery('order-1', ' 4821 ');

      expect(requests.single.url.path, '/api/v1/orders/order-1/complete');
      expect(jsonDecode(requests.single.body), {'code': '4821'});
    });

    test(
      'the handover sends no amount, because it is not the driver to decide',
      () async {
        final requests = <http.Request>[];
        final repository = DeliveryRepository(
          _client(
            MockClient((request) async {
              requests.add(request);
              return _json(200, {
                'data': orderJson(
                  status: 'delivered',
                  paymentMethod: 'cash',
                  cashGivenToVendor: true,
                ),
              });
            }),
          ),
        );

        await repository.recordCashHandover('order-1');

        expect(requests.single.method, 'POST');
        expect(
          requests.single.url.path,
          '/api/v1/orders/order-1/cash-handover',
        );
        expect(requests.single.body, isEmpty);
      },
    );

    test('a wrong code carries how many tries are left', () {
      final error = ApiException.fromResponse(422, {
        'error': {
          'code': 'unprocessable',
          'message': 'That delivery code is not correct.',
          'details': {'attemptsRemaining': 2},
        },
      });

      expect(attemptsRemainingIn(error), 2);
    });

    test('an error with no attempt count says so rather than guessing', () {
      final error = ApiException.fromResponse(409, {
        'error': {'code': 'conflict', 'message': 'Nope.'},
      });

      expect(attemptsRemainingIn(error), isNull);
    });
  });

  group('the delivery screen', () {
    Future<List<http.Request>> pumpDelivery(
      WidgetTester tester, {
      required http.Response Function(http.Request request) respond,
    }) async {
      // Tall enough that the whole screen is built: the action a driver
      // presses lives at the bottom, and an unbuilt widget cannot be tapped.
      tester.view.physicalSize = const Size(1000, 2600);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final requests = <http.Request>[];

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            apiClientProvider.overrideWithValue(
              _client(
                MockClient((request) async {
                  requests.add(request);
                  return respond(request);
                }),
              ),
            ),
          ],
          child: const MaterialApp(home: DeliveryPage(orderId: 'order-1')),
        ),
      );
      await tester.pumpAndSettle();
      return requests;
    }

    testWidgets('an order still cooking is not offered a collect button', (
      tester,
    ) async {
      await pumpDelivery(
        tester,
        respond: (_) => _json(200, {'data': orderJson(status: 'preparing')}),
      );

      expect(find.text('The kitchen is still cooking'), findsOneWidget);
      expect(find.text('Collected from the kitchen'), findsNothing);
      // Handing it back is the one thing they can do.
      expect(find.text('Give this delivery back'), findsOneWidget);
    });

    testWidgets('a ready order offers collection', (tester) async {
      final requests = await pumpDelivery(
        tester,
        respond: (request) => request.method == 'PATCH'
            ? _json(200, {'data': orderJson(status: 'picked_up')})
            : _json(200, {'data': orderJson(status: 'ready')}),
      );

      expect(find.text('Ready for you'), findsOneWidget);

      await tester.tap(find.text('Collected from the kitchen'));
      await tester.pumpAndSettle();

      expect(requests.last.method, 'PATCH');
      // The screen moves on with what the API returned, without asking again.
      expect(find.text('Take it to the customer'), findsOneWidget);
    });

    testWidgets('the address, the note and the number are all there', (
      tester,
    ) async {
      await pumpDelivery(
        tester,
        respond: (_) => _json(200, {'data': orderJson(status: 'picked_up')}),
      );

      expect(find.textContaining('12 Vilakazi Street'), findsOneWidget);
      expect(find.text('Blue gate, ring twice'), findsOneWidget);
      expect(find.text('0821234567'), findsOneWidget);
    });

    testWidgets('confirming a delivery needs the code from the customer', (
      tester,
    ) async {
      final requests = await pumpDelivery(
        tester,
        respond: (request) => request.method == 'POST'
            ? _json(200, {'data': orderJson(status: 'delivered')})
            : _json(200, {'data': orderJson(status: 'picked_up')}),
      );

      await tester.tap(find.text('Confirm delivery'));
      await tester.pumpAndSettle();
      expect(find.text('Delivery code'), findsOneWidget);

      await tester.enterText(find.byType(TextFormField), '4821');
      await tester.tap(find.widgetWithText(FilledButton, 'Confirm'));
      await tester.pumpAndSettle();

      expect(
        requests.any((r) => r.url.path == '/api/v1/orders/order-1/complete'),
        true,
      );
      expect(find.text('Delivered'), findsWidgets);
      expect(find.text('Nice one. This delivery is done.'), findsOneWidget);
    });

    testWidgets('a code of the wrong shape never reaches the API', (
      tester,
    ) async {
      final requests = await pumpDelivery(
        tester,
        respond: (_) => _json(200, {'data': orderJson(status: 'picked_up')}),
      );
      final before = requests.length;

      await tester.tap(find.text('Confirm delivery'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField), '12');
      await tester.tap(find.widgetWithText(FilledButton, 'Confirm'));
      await tester.pumpAndSettle();

      expect(
        find.text('Enter the code the customer reads out.'),
        findsOneWidget,
      );
      expect(requests.length, before);
    });

    testWidgets('a wrong code says how many tries are left', (tester) async {
      await pumpDelivery(
        tester,
        respond: (request) => request.method == 'POST'
            ? _json(422, {
                'error': {
                  'code': 'unprocessable',
                  'message': 'That delivery code is not correct.',
                  'details': {'attemptsRemaining': 2},
                },
              })
            : _json(200, {'data': orderJson(status: 'picked_up')}),
      );

      await tester.tap(find.text('Confirm delivery'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField), '1111');
      await tester.tap(find.widgetWithText(FilledButton, 'Confirm'));
      await tester.pumpAndSettle();

      expect(find.textContaining('2 tries left'), findsOneWidget);
      // Still on the delivery, still able to try again.
      expect(find.text('Confirm delivery'), findsOneWidget);
    });

    testWidgets('a delivered cash order asks the driver to pay the kitchen', (
      tester,
    ) async {
      final requests = await pumpDelivery(
        tester,
        respond: (request) => request.url.path.endsWith('/cash-handover')
            ? _json(200, {
                'data': orderJson(
                  status: 'delivered',
                  paymentMethod: 'cash',
                  cashGivenToVendor: true,
                ),
              })
            : _json(200, {
                'data': orderJson(status: 'delivered', paymentMethod: 'cash'),
              }),
      );

      expect(find.text('Pay the kitchen'), findsOneWidget);
      expect(find.textContaining(formatRands(179.98)), findsWidgets);

      await tester.tap(find.textContaining('I paid Mama Ntuli Kota Corner'));
      await tester.pumpAndSettle();

      expect(requests.any((r) => r.url.path.endsWith('/cash-handover')), true);
      // Settled from the driver's side; now it is the kitchen's turn.
      expect(find.text('Pay the kitchen'), findsNothing);
      expect(
        find.textContaining('Waiting for Mama Ntuli Kota Corner'),
        findsOneWidget,
      );
    });

    testWidgets('a disputed handover is not shown as finished', (tester) async {
      await pumpDelivery(
        tester,
        respond: (_) => _json(200, {
          'data': orderJson(
            status: 'delivered',
            paymentMethod: 'cash',
            cashGivenToVendor: true,
            vendorCashDisputed: true,
          ),
        }),
      );

      expect(
        find.textContaining('says they did not get the cash'),
        findsOneWidget,
      );
    });

    testWidgets('a delivered card order is done, with nothing left to press', (
      tester,
    ) async {
      await pumpDelivery(
        tester,
        respond: (_) => _json(200, {'data': orderJson(status: 'delivered')}),
      );

      expect(find.text('Nice one. This delivery is done.'), findsOneWidget);
      expect(find.byType(FilledButton), findsNothing);
    });
  });
}
