/// Reading a ledger as earnings.
///
/// The cases are the real shapes the server writes: a driver's cash delivery,
/// a kitchen's card order with its pending-to-available move, and a kitchen's
/// cash order after the handover.
library;

import 'package:flutter_test/flutter_test.dart';

import 'package:lokshineats_core/wallet/earnings.dart';
import 'package:lokshineats_core/wallet/wallet.dart';

LedgerEntry entry(
  String id,
  String type,
  double amount, {
  String? orderId = 'order-abc123',
  String balance = 'available',
  DateTime? at,
}) => LedgerEntry.fromJson({
  'id': id,
  'type': type,
  'amount': amount,
  'balance': balance,
  'description': type,
  'orderId': orderId,
  'createdAt': (at ?? DateTime(2026, 9, 20, 12)).toUtc().toIso8601String(),
});

void main() {
  group('grouping by order', () {
    test("a driver's cash delivery reads as one order, net of the cash", () {
      final groups = groupByOrder([
        entry('3', 'cash_handover', 179.98),
        entry('2', 'cash_collected', -199.98),
        entry('1', 'order_earning', 17),
      ]);

      expect(groups, hasLength(1));
      expect(groups.single.entries, hasLength(3));
      // Earned R17, holding R20 of the customer's cash: owes R3.
      expect(groups.single.net, -3);
      expect(groups.single.involvesCash, true);
      expect(groups.single.reference, 'ABC123');
    });

    test("a kitchen's pending-to-available move is not shown as news", () {
      final groups = groupByOrder([
        entry('3', 'adjustment', 165.58, balance: 'available'),
        entry('2', 'adjustment', -165.58, balance: 'pending'),
        entry('1', 'order_earning', 165.58, balance: 'pending'),
      ]);

      // Only the earning is left: the pair moved money between buckets and
      // changed nothing the kitchen owns.
      expect(groups.single.entries.map((e) => e.type), [
        LedgerEntryType.orderEarning,
      ]);
      expect(groups.single.net, 165.58);
    });

    test('an adjustment that does change the balance is kept', () {
      final groups = groupByOrder([
        entry('2', 'adjustment', -10),
        entry('1', 'order_earning', 92),
      ]);

      expect(groups.single.entries, hasLength(2));
      expect(groups.single.net, 82);
    });

    test("a kitchen's cash order ends at the commission it owes", () {
      final groups = groupByOrder([
        entry('4', 'cash_handover', -100),
        entry('3', 'adjustment', 92),
        entry('2', 'adjustment', -92, balance: 'pending'),
        entry('1', 'order_earning', 92, balance: 'pending'),
      ]);

      expect(groups.single.net, -8);
    });

    test('an entry with no order stands alone', () {
      final groups = groupByOrder([
        entry('2', 'bonus', 50, orderId: null),
        entry('1', 'order_earning', 17),
      ]);

      expect(groups, hasLength(2));
      expect(groups.where((g) => g.orderId == null).single.net, 50);
    });

    test('the newest order comes first, whatever order entries arrive in', () {
      final groups = groupByOrder([
        entry(
          '1',
          'order_earning',
          17,
          orderId: 'older',
          at: DateTime(2026, 9, 1),
        ),
        entry(
          '2',
          'order_earning',
          17,
          orderId: 'newer',
          at: DateTime(2026, 9, 20),
        ),
      ]);

      expect(groups.map((g) => g.orderId), ['newer', 'older']);
    });

    test('money is summed in cents, not floating point', () {
      final groups = groupByOrder([
        entry('2', 'order_earning', 0.2),
        entry('1', 'order_earning', 0.1),
      ]);

      expect(groups.single.net, 0.3);
    });
  });

  group('a week of earnings', () {
    final now = DateTime(2026, 9, 21, 12);
    final since = now.subtract(const Duration(days: 7));

    test('counts earnings in the window, one order at a time', () {
      final summary = summarise(
        [
          entry('3', 'order_earning', 17, orderId: 'a', at: now),
          entry('2', 'cash_collected', -120, orderId: 'a', at: now),
          entry('1', 'order_earning', 17, orderId: 'b', at: now),
        ],
        since: since,
        historyComplete: true,
      );

      expect(summary.orders, 2);
      // What they made, before anything owed on cash.
      expect(summary.earned, 34);
      expect(summary.complete, true);
    });

    test('leaves out anything older than the window', () {
      final summary = summarise(
        [
          entry('2', 'order_earning', 17, orderId: 'recent', at: now),
          entry(
            '1',
            'order_earning',
            17,
            orderId: 'old',
            at: now.subtract(const Duration(days: 9)),
          ),
        ],
        since: since,
        historyComplete: false,
      );

      expect(summary.orders, 1);
      expect(summary.earned, 17);
      // The loaded history reaches past the window, so this is the whole week.
      expect(summary.complete, true);
    });

    test('says so when the history might not reach back far enough', () {
      final summary = summarise(
        [entry('1', 'order_earning', 17, at: now)],
        since: since,
        historyComplete: false,
      );

      expect(summary.complete, false);
    });
  });
}
