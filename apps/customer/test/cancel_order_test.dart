/// Cancelling an order from the app.
///
/// What matters is the order of events: the customer is shown the cost the
/// API worked out before anything is cancelled, nothing is cancelled unless
/// they agree, and the cancellation carries the stage they were shown so a
/// price that changed underneath them is refused rather than charged.
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
import 'package:lokshineats_customer/features/orders/models/order.dart';
import 'package:lokshineats_customer/features/orders/repositories/order_repository.dart';
import 'package:lokshineats_customer/features/orders/widgets/cancel_order_button.dart';

CustomerOrder activeOrder({
  String paymentMethod = 'yoco',
  String paymentStatus = 'paid',
}) {
  return CustomerOrder.fromJson({
    'id': 'order-1',
    'status': 'preparing',
    'paymentStatus': paymentStatus,
    'paymentMethod': paymentMethod,
    'storeName': 'Mama Ntuli Kota Corner',
    'subtotal': 100,
    'deliveryFee': 20,
    'total': 120,
  });
}

CancellationPreview preview({
  bool allowed = true,
  String? stage = 'in_kitchen',
  double customerRefund = 19.5,
  double vendorPay = 92,
  double driverPay = 8.5,
  String? reason,
  String? code,
}) => CancellationPreview(
  allowed: allowed,
  stage: stage,
  customerRefund: customerRefund,
  vendorPay: vendorPay,
  driverPay: driverPay,
  reason: reason,
  code: code,
);

Map<String, dynamic> previewJson({
  bool allowed = true,
  String? code,
  String? reason,
}) => {
  'allowed': allowed,
  'code': code,
  'reason': reason,
  'stage': 'in_kitchen',
  'customerRefund': allowed ? 19.5 : 0,
  'vendorPay': allowed ? 92 : 0,
  'driverPay': allowed ? 8.5 : 0,
};

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
  group('preview model', () {
    test('reads the API\'s figures and the stage to send back', () {
      final parsed = CancellationPreview.fromJson(previewJson());

      expect(parsed.allowed, isTrue);
      expect(parsed.stage, 'in_kitchen');
      expect(parsed.customerRefund, 19.5);
      expect(parsed.vendorPay, 92);
      expect(parsed.driverPay, 8.5);
    });

    test('reads a refusal and its reason', () {
      final parsed = CancellationPreview.fromJson(
        previewJson(
          allowed: false,
          code: 'needs_admin',
          reason: 'Contact support.',
        ),
      );

      expect(parsed.allowed, isFalse);
      expect(parsed.code, 'needs_admin');
      expect(parsed.reason, 'Contact support.');
    });
  });

  group('what the confirmation says, by tier', () {
    test('before prep: the full amount comes back', () {
      final lines = describeCancellationPreview(
        preview(
          stage: 'before_prep',
          customerRefund: 120,
          vendorPay: 0,
          driverPay: 0,
        ),
        activeOrder(),
      );

      expect(lines.single, contains('full'));
      expect(lines.single, contains('back in your LokshinEats wallet'));
    });

    test(
      'in the kitchen with a driver dispatched: refund, food and trip, each named',
      () {
        final lines = describeCancellationPreview(preview(), activeOrder());

        expect(lines, hasLength(3));
        expect(lines[0], contains('back in your LokshinEats wallet'));
        expect(
          lines[1],
          contains('pays the kitchen for food that is already being made'),
        );
        expect(lines[2], contains('pays your driver'));
      },
    );

    test('in the kitchen with no driver yet: no driver line', () {
      final lines = describeCancellationPreview(
        preview(customerRefund: 28, driverPay: 0),
        activeOrder(),
      );

      expect(lines, hasLength(2));
      expect(lines.join(' '), isNot(contains('driver')));
    });

    test('on the way: no refund, and why', () {
      final lines = describeCancellationPreview(
        preview(
          stage: 'on_the_way',
          customerRefund: 0,
          vendorPay: 92,
          driverPay: 17,
        ),
        activeOrder(),
      );

      expect(lines.single, startsWith('There’s no refund'));
    });

    test('an order not paid for up front: nothing to refund', () {
      final lines = describeCancellationPreview(
        preview(
          stage: 'before_prep',
          customerRefund: 0,
          vendorPay: 0,
          driverPay: 0,
        ),
        activeOrder(paymentMethod: 'cash', paymentStatus: 'pending'),
      );

      expect(lines.single, contains('nothing to refund'));
    });
  });

  group('repository', () {
    test(
      'previews with a read and cancels with the stage it was shown',
      () async {
        final requests = <http.Request>[];

        final repository = OrderRepository(
          _client(
            MockClient((request) async {
              requests.add(request);
              if (request.method == 'GET') {
                return _json(200, {'data': previewJson()});
              }
              return _json(200, {'data': activeOrder().toJsonForTest()});
            }),
          ),
        );

        final shown = await repository.previewCancellation('order-1');
        await repository.cancelOrder('order-1', expectedStage: shown.stage!);

        expect(requests[0].method, 'GET');
        expect(
          requests[0].url.path,
          '/api/v1/orders/order-1/cancellation-preview',
        );
        expect(requests[0].headers['Authorization'], 'Bearer test-id-token');

        expect(requests[1].method, 'PATCH');
        expect(requests[1].url.path, '/api/v1/orders/order-1/status');
        expect(jsonDecode(requests[1].body), {
          'status': 'cancelled',
          'expectedStage': 'in_kitchen',
        });
      },
    );
  });

  group('cancel button', () {
    Future<List<http.Request>> pumpButton(
      WidgetTester tester, {
      required http.Response Function(http.Request request) respond,
      required void Function() onOrderChanged,
    }) async {
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
          child: MaterialApp(
            theme: AppTheme.light,
            home: Scaffold(
              body: Center(
                child: CancelOrderButton(
                  order: activeOrder(),
                  onOrderChanged: onOrderChanged,
                ),
              ),
            ),
          ),
        ),
      );
      return requests;
    }

    Finder confirmButton() => find.widgetWithText(FilledButton, 'Cancel order');

    testWidgets('shows the cost first, then cancels with the stage shown', (
      tester,
    ) async {
      var changed = 0;
      final requests = await pumpButton(
        tester,
        respond: (request) => request.method == 'GET'
            ? _json(200, {'data': previewJson()})
            : _json(200, {
                'data': activeOrder().toJsonForTest(status: 'cancelled'),
              }),
        onOrderChanged: () => changed++,
      );

      await tester.tap(find.text('Cancel order'));
      await tester.pumpAndSettle();

      // Only the preview has been asked for; nothing is cancelled yet.
      expect(requests.map((r) => r.method), ['GET']);
      expect(find.text('Cancel this order?'), findsOneWidget);
      expect(
        find.textContaining('back in your LokshinEats wallet'),
        findsOneWidget,
      );
      expect(find.textContaining('pays your driver'), findsOneWidget);

      await tester.tap(confirmButton());
      await tester.pumpAndSettle();

      expect(requests.map((r) => r.method), ['GET', 'PATCH']);
      expect(jsonDecode(requests.last.body), {
        'status': 'cancelled',
        'expectedStage': 'in_kitchen',
      });
      expect(find.text('Order cancelled'), findsOneWidget);
      expect(changed, 1);
    });

    testWidgets('keeping the order cancels nothing', (tester) async {
      var changed = 0;
      final requests = await pumpButton(
        tester,
        respond: (_) => _json(200, {'data': previewJson()}),
        onOrderChanged: () => changed++,
      );

      await tester.tap(find.text('Cancel order'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Keep order'));
      await tester.pumpAndSettle();

      expect(requests.map((r) => r.method), ['GET']);
      expect(changed, 0);
    });

    testWidgets(
      'an order that cannot be cancelled here explains why and cancels nothing',
      (tester) async {
        final requests = await pumpButton(
          tester,
          respond: (_) => _json(200, {
            'data': previewJson(
              allowed: false,
              code: 'needs_admin',
              reason:
                  'Your food is already being prepared and this order was not paid in advance, '
                  'so it can only be cancelled by LokshinEats support.',
            ),
          }),
          onOrderChanged: () {},
        );

        await tester.tap(find.text('Cancel order'));
        await tester.pumpAndSettle();

        expect(find.text('This order can’t be cancelled here'), findsOneWidget);
        expect(find.textContaining('LokshinEats support'), findsOneWidget);
        expect(confirmButton(), findsNothing);
        expect(requests.map((r) => r.method), ['GET']);
      },
    );

    testWidgets(
      'if the order moved on meanwhile, says so and refreshes instead of charging',
      (tester) async {
        var changed = 0;
        await pumpButton(
          tester,
          respond: (request) => request.method == 'GET'
              ? _json(200, {'data': previewJson()})
              : _json(409, {
                  'error': {
                    'code': 'conflict',
                    'message':
                        'This order has moved on since you checked what cancelling would cost. '
                        'Check again before cancelling.',
                  },
                }),
          onOrderChanged: () => changed++,
        );

        await tester.tap(find.text('Cancel order'));
        await tester.pumpAndSettle();
        await tester.tap(confirmButton());
        await tester.pumpAndSettle();

        expect(find.textContaining('moved on'), findsOneWidget);
        expect(find.text('Order cancelled'), findsNothing);
        expect(changed, 1);
      },
    );
  });
}

extension on CustomerOrder {
  /// Just enough of the API's order shape for a response body.
  Map<String, dynamic> toJsonForTest({String? status}) => {
    'id': id,
    'status': status ?? 'preparing',
    'paymentStatus': paymentStatus,
    'paymentMethod': paymentMethod.wire,
    'storeName': storeName,
    'subtotal': subtotal,
    'deliveryFee': deliveryFee,
    'total': total,
  };
}
