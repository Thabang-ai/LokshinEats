/// How the app explains a cancelled order.
///
/// The API settles cancellations in tiers — a full refund before the kitchen
/// starts, the food and a dispatched driver's trip paid for after, nothing
/// back once the driver has collected it. The app only reads the outcome, but
/// a wrong sentence here tells a customer their money vanished, so every tier
/// is checked against the wording it produces.
///
/// One order throughout: R120 paid, R92 kitchen share, R17 driver pay.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lokshineats_core/theme/app_theme.dart';
import 'package:lokshineats_customer/features/orders/models/order.dart';
import 'package:lokshineats_customer/features/orders/widgets/order_sections.dart';

CustomerOrder cancelledOrder({
  String paymentStatus = 'partially_refunded',
  String paymentMethod = 'yoco',
  double refundedAmount = 19.5,
  Map<String, dynamic>? cancellation = const {
    'stage': 'in_kitchen',
    'initiator': 'customer',
    'fromStatus': 'preparing',
    'customerRefund': 19.5,
    'vendorPay': 92,
    'driverPay': 8.5,
    'settled': true,
    'cancelledAt': '2026-09-15T18:30:00.000Z',
  },
}) {
  return CustomerOrder.fromJson({
    'id': 'order-1',
    'status': 'cancelled',
    'paymentStatus': paymentStatus,
    'paymentMethod': paymentMethod,
    'storeName': 'Mama Ntuli Kota Corner',
    'subtotal': 100,
    'deliveryFee': 20,
    'total': 120,
    'refundedAmount': refundedAmount,
    'cancellation': cancellation,
  });
}

Map<String, dynamic> record({
  required String stage,
  String initiator = 'customer',
  double customerRefund = 0,
  double vendorPay = 0,
  double driverPay = 0,
  bool settled = true,
}) => {
  'stage': stage,
  'initiator': initiator,
  'customerRefund': customerRefund,
  'vendorPay': vendorPay,
  'driverPay': driverPay,
  'settled': settled,
};

void main() {
  group('order model', () {
    test('reads the refund and how the cancellation was settled', () {
      final order = cancelledOrder();

      expect(order.refundedAmount, 19.5);
      expect(order.wasPrepaid, isTrue);
      expect(order.cancellation?.stage, 'in_kitchen');
      expect(order.cancellation?.vendorPay, 92);
      expect(order.cancellation?.driverPay, 8.5);
      expect(order.cancellation?.settled, isTrue);
    });

    test(
      'an order cancelled before cancellations were recorded has no record',
      () {
        final order = cancelledOrder(
          cancellation: null,
          paymentStatus: 'pending',
          refundedAmount: 0,
        );

        expect(order.cancellation, isNull);
        expect(order.refundedAmount, 0);
      },
    );

    test('a cash order was never prepaid, whatever its status says', () {
      final order = cancelledOrder(
        paymentMethod: 'cash',
        paymentStatus: 'pending',
      );

      expect(order.wasPrepaid, isFalse);
    });
  });

  group('cancellation wording, by tier', () {
    test('before prep: a full refund, said plainly', () {
      final (headline, detail) = describeCancellation(
        cancelledOrder(
          paymentStatus: 'refunded',
          refundedAmount: 120,
          cancellation: record(stage: 'before_prep', customerRefund: 120),
        ),
      );

      expect(headline, 'You cancelled this order before the kitchen started.');
      expect(detail, startsWith('Your full payment of '));
      expect(detail, endsWith('is back in your LokshinEats wallet.'));
    });

    test(
      'in the kitchen: what came back, and what paid for the food and the trip',
      () {
        final (headline, detail) = describeCancellation(cancelledOrder());

        expect(
          headline,
          'You cancelled this order while it was being prepared.',
        );
        expect(detail, contains('is back in your LokshinEats wallet.'));
        expect(detail, contains('paid the kitchen for food already made'));
        expect(detail, contains('paid your driver for the trip'));
      },
    );

    test('in the kitchen with no driver yet: no mention of one', () {
      final (_, detail) = describeCancellation(
        cancelledOrder(
          refundedAmount: 28,
          cancellation: record(
            stage: 'in_kitchen',
            customerRefund: 28,
            vendorPay: 92,
          ),
        ),
      );

      expect(detail, contains('paid the kitchen'));
      expect(detail, isNot(contains('driver')));
    });

    test('on the way: no refund, and why', () {
      final (headline, detail) = describeCancellation(
        cancelledOrder(
          paymentStatus: 'paid',
          refundedAmount: 0,
          cancellation: record(
            stage: 'on_the_way',
            vendorPay: 92,
            driverPay: 17,
          ),
        ),
      );

      expect(
        headline,
        'You cancelled this order after your driver collected it.',
      );
      expect(detail, startsWith('There was no refund'));
    });

    test(
      'the kitchen cancelling: the customer is not blamed and gets everything back',
      () {
        final (headline, detail) = describeCancellation(
          cancelledOrder(
            paymentStatus: 'refunded',
            refundedAmount: 120,
            cancellation: record(
              stage: 'in_kitchen',
              initiator: 'vendor',
              customerRefund: 120,
            ),
          ),
        );

        expect(headline, 'The kitchen cancelled this order.');
        expect(detail, startsWith('Your full payment'));
      },
    );

    test('a goodwill top-up after a partial refund reads as a full refund', () {
      // The cancellation itself returned R19.50; an admin topped it up to R120.
      final (_, detail) = describeCancellation(
        cancelledOrder(paymentStatus: 'refunded', refundedAmount: 120),
      );

      expect(detail, startsWith('Your full payment'));
    });

    test('while the money is still moving: say so, rather than show R0', () {
      final (_, detail) = describeCancellation(
        cancelledOrder(
          refundedAmount: 0,
          paymentStatus: 'paid',
          cancellation: record(
            stage: 'in_kitchen',
            customerRefund: 19.5,
            settled: false,
          ),
        ),
      );

      expect(detail, contains('being processed'));
    });

    test('a cash order has no money to explain', () {
      final (_, detail) = describeCancellation(
        cancelledOrder(
          paymentMethod: 'cash',
          paymentStatus: 'pending',
          refundedAmount: 0,
          cancellation: record(stage: 'before_prep'),
        ),
      );

      expect(detail, isNull);
    });
  });

  group('payment line', () {
    Future<void> pumpRow(WidgetTester tester, CustomerOrder order) {
      return tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light,
          home: Scaffold(body: PaymentStatusRow(order: order)),
        ),
      );
    }

    testWidgets('a partial refund shows how much came back', (tester) async {
      await pumpRow(tester, cancelledOrder());

      expect(
        find.textContaining('refunded to your LokshinEats wallet'),
        findsOneWidget,
      );
      expect(find.textContaining('Not charged'), findsNothing);
    });

    testWidgets(
      'a paid order cancelled after pickup says there was no refund',
      (tester) async {
        await pumpRow(
          tester,
          cancelledOrder(
            paymentStatus: 'paid',
            refundedAmount: 0,
            cancellation: record(
              stage: 'on_the_way',
              vendorPay: 92,
              driverPay: 17,
            ),
          ),
        );

        expect(find.textContaining('no refund'), findsOneWidget);
      },
    );

    testWidgets('the tracking notice renders the tier explanation', (
      tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light,
          home: Scaffold(body: CancellationNotice(order: cancelledOrder())),
        ),
      );

      expect(
        find.text('You cancelled this order while it was being prepared.'),
        findsOneWidget,
      );
      expect(
        find.textContaining('paid your driver for the trip'),
        findsOneWidget,
      );
    });
  });
}
