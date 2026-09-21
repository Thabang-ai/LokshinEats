/// Reading a ledger as earnings: what each order meant, and what a week added up to.
///
/// The ledger records every movement, including ones that matter to the books
/// but not to a person: a kitchen's earnings move from pending to available
/// when the order is delivered, written as a pair of entries that cancel out.
/// Listed raw, every delivered order would show two unexplained adjustments.
///
/// So earnings are read per order. Each order becomes one row showing what it
/// meant for this wallet overall, with the entries that explain it, and any
/// internal move that nets to nothing within the order is left out - a rule
/// about the shape of the entries, not about the wording the server used.
///
/// Pure functions over entries the app has already loaded, so both earning
/// apps read money the same way and it is tested once.
library;

import 'wallet.dart';

/// One order's effect on a wallet, or a single entry with no order behind it
/// (an admin credit, say).
class OrderEarnings {
  const OrderEarnings({required this.orderId, required this.entries});

  /// Null for an entry that belongs to no order.
  final String? orderId;

  /// Newest first, as the ledger returns them. Excludes internal moves that
  /// cancel out - see [groupByOrder].
  final List<LedgerEntry> entries;

  /// What this order changed the balance by, across both buckets.
  double get net => _sumCents(entries.map((e) => e.amount)) / 100;

  /// When the most recent thing happened on this order.
  DateTime? get when {
    DateTime? latest;
    for (final entry in entries) {
      final at = entry.createdAt;
      if (at != null && (latest == null || at.isAfter(latest))) latest = at;
    }
    return latest;
  }

  /// Short form of the order id, as the apps print it on tickets.
  String? get reference {
    final id = orderId;
    if (id == null) return null;
    return id.length <= 6 ? id : id.substring(id.length - 6).toUpperCase();
  }

  /// This order involved cash changing hands.
  bool get involvesCash => entries.any(
    (e) =>
        e.type == LedgerEntryType.cashCollected ||
        e.type == LedgerEntryType.cashHandover,
  );
}

/// Group a wallet's entries by order, newest order first.
///
/// Within an order, adjustments that sum to zero are dropped: that is the
/// shape of an internal move between the pending and available buckets, and
/// it changes nothing the person owns. Adjustments that do change the balance
/// are kept, because then they are news.
List<OrderEarnings> groupByOrder(List<LedgerEntry> entries) {
  final byOrder = <String, List<LedgerEntry>>{};
  final standalone = <OrderEarnings>[];
  final order = <String>[];

  for (final entry in entries) {
    final id = entry.orderId;
    if (id == null) {
      standalone.add(OrderEarnings(orderId: null, entries: [entry]));
      continue;
    }
    if (!byOrder.containsKey(id)) order.add(id);
    byOrder.putIfAbsent(id, () => []).add(entry);
  }

  final grouped = <OrderEarnings>[
    for (final id in order)
      OrderEarnings(orderId: id, entries: _withoutNettingMoves(byOrder[id]!)),
    ...standalone,
  ];

  // Newest activity first, whatever order the entries arrived in.
  grouped.sort((a, b) {
    final aw = a.when;
    final bw = b.when;
    if (aw == null && bw == null) return 0;
    if (aw == null) return 1;
    if (bw == null) return -1;
    return bw.compareTo(aw);
  });

  return grouped;
}

List<LedgerEntry> _withoutNettingMoves(List<LedgerEntry> entries) {
  final adjustments = entries
      .where((e) => e.type == LedgerEntryType.adjustment)
      .toList();
  if (adjustments.isEmpty) return entries;
  if (_sumCents(adjustments.map((e) => e.amount)) != 0) return entries;
  return entries.where((e) => e.type != LedgerEntryType.adjustment).toList();
}

/// What a stretch of time added up to.
class EarningsSummary {
  const EarningsSummary({
    required this.orders,
    required this.earned,
    required this.complete,
  });

  /// Orders with earnings in the window.
  final int orders;

  /// Earnings in the window, before anything owed on cash orders: the pay a
  /// person would recognise as what they made.
  final double earned;

  /// Whether the loaded history reaches back far enough to be sure. When it
  /// does not, the figures are a lower bound and the screen says "so far".
  final bool complete;
}

/// Earnings from [since] onwards.
///
/// [historyComplete] is true when there is nothing older left to load; the
/// summary is also complete if the loaded history already reaches past
/// [since].
EarningsSummary summarise(
  List<LedgerEntry> entries, {
  required DateTime since,
  required bool historyComplete,
}) {
  final inWindow = entries.where(
    (e) =>
        e.type == LedgerEntryType.orderEarning &&
        e.createdAt != null &&
        !e.createdAt!.isBefore(since),
  );

  final orders = <String>{};
  final amounts = <double>[];
  for (final entry in inWindow) {
    if (entry.orderId != null) orders.add(entry.orderId!);
    amounts.add(entry.amount);
  }

  final oldest = entries
      .map((e) => e.createdAt)
      .whereType<DateTime>()
      .fold<DateTime?>(
        null,
        (min, at) => min == null || at.isBefore(min) ? at : min,
      );

  return EarningsSummary(
    orders: orders.length,
    earned: _sumCents(amounts) / 100,
    complete: historyComplete || (oldest != null && oldest.isBefore(since)),
  );
}

/// Sum rands in cents, so R0.10 + R0.20 is R0.30 and not 0.30000000000000004.
int _sumCents(Iterable<double> amounts) =>
    amounts.fold(0, (total, amount) => total + (amount * 100).round());
