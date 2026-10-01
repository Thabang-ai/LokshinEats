/// A wallet, as the API returns it, for whoever is signed in.
///
/// For a customer it holds money coming back from LokshinEats: a refund, or a
/// credit. For a driver or a kitchen it holds what they have earned - and, on
/// cash orders, what they owe, which can take the balance below zero. No app
/// can move a balance: every entry is written server-side by settlement or by
/// an admin, and the API has no endpoint that lets anyone change their own.
/// So these are read-only views of the server's ledger.
library;

/// Why money moved. Mirrors `LEDGER_ENTRY_TYPES` in
/// `server/src/modules/wallets/wallet.model.ts`; an unknown type reads as an
/// adjustment, the same fallback the server uses.
enum LedgerEntryType {
  orderEarning,
  commission,
  refund,
  bonus,
  withdrawal,
  adjustment,

  /// Money the platform paid out beyond what a customer paid. Customers do
  /// not receive entries of this type — a goodwill refund reaches them as a
  /// refund — but it is listed so the app reads every type the API sends.
  goodwill,

  /// A driver collecting a cash order's total at the door: money they are
  /// holding that belongs to the kitchen and the platform.
  cashCollected,

  /// The kitchen's share of a cash order changing hands: a payout to the
  /// kitchen made in cash, and the driver's debt to the kitchen cleared.
  cashHandover;

  static LedgerEntryType fromWire(Object? value) => switch (value) {
    'order_earning' => LedgerEntryType.orderEarning,
    'commission' => LedgerEntryType.commission,
    'refund' => LedgerEntryType.refund,
    'bonus' => LedgerEntryType.bonus,
    'withdrawal' => LedgerEntryType.withdrawal,
    'goodwill' => LedgerEntryType.goodwill,
    'cash_collected' => LedgerEntryType.cashCollected,
    'cash_handover' => LedgerEntryType.cashHandover,
    _ => LedgerEntryType.adjustment,
  };

  /// How the entry is named in a customer's history.
  String get label => switch (this) {
    LedgerEntryType.refund => 'Refund',
    LedgerEntryType.bonus => 'Credit',
    LedgerEntryType.adjustment => 'Adjustment',
    LedgerEntryType.withdrawal => 'Withdrawal',
    LedgerEntryType.orderEarning => 'Order earnings',
    LedgerEntryType.commission => 'Commission',
    LedgerEntryType.goodwill => 'Goodwill',
    LedgerEntryType.cashCollected => 'Cash collected',
    LedgerEntryType.cashHandover => 'Cash handover',
  };
}

class Wallet {
  const Wallet({
    required this.availableBalance,
    required this.pendingBalance,
    required this.totalBalance,
    this.updatedAt,
  });

  factory Wallet.fromJson(Map<String, dynamic> json) {
    return Wallet(
      availableBalance: _money(json['availableBalance']),
      pendingBalance: _money(json['pendingBalance']),
      totalBalance: _money(json['totalBalance']),
      updatedAt: _date(json['updatedAt']),
    );
  }

  /// Cleared money.
  final double availableBalance;

  /// Credited but not yet cleared. Customer credits land straight in
  /// [availableBalance], so for a customer this is normally zero.
  final double pendingBalance;

  final double totalBalance;

  /// Null for a wallet that has never had an entry.
  final DateTime? updatedAt;
}

class LedgerEntry {
  const LedgerEntry({
    required this.id,
    required this.type,
    required this.amount,
    required this.isPending,
    required this.description,
    this.orderId,
    this.createdAt,
  });

  factory LedgerEntry.fromJson(Map<String, dynamic> json) {
    return LedgerEntry(
      id: json['id'] as String? ?? '',
      type: LedgerEntryType.fromWire(json['type']),
      amount: _money(json['amount']),
      isPending: json['balance'] == 'pending',
      description: json['description'] as String? ?? '',
      orderId: switch (json['orderId']) {
        final String s when s.isNotEmpty => s,
        _ => null,
      },
      createdAt: _date(json['createdAt']),
    );
  }

  final String id;
  final LedgerEntryType type;

  /// Signed, as the server stores it: positive credits the wallet, negative
  /// debits it.
  final double amount;

  final bool isPending;
  final String description;

  /// The order a refund belongs to, when there is one.
  final String? orderId;

  final DateTime? createdAt;

  bool get isCredit => amount >= 0;
}

double _money(Object? value) => switch (value) {
  final num n when n.isFinite => n.toDouble(),
  _ => 0,
};

/// The API sends ISO-8601 strings. Shown in the device's local time.
DateTime? _date(Object? value) =>
    value is String ? DateTime.tryParse(value)?.toLocal() : null;
