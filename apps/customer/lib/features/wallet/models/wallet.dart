/// A customer's wallet, as the API returns it.
///
/// For a customer the wallet holds money coming back from LokshinEats: a
/// refund for an order, or a credit. Nothing in this app can move a balance —
/// every entry is written server-side by settlement or by an admin, and the
/// API has no endpoint that lets a user change their own. So these are
/// read-only views of the server's ledger.
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
  adjustment;

  static LedgerEntryType fromWire(Object? value) => switch (value) {
    'order_earning' => LedgerEntryType.orderEarning,
    'commission' => LedgerEntryType.commission,
    'refund' => LedgerEntryType.refund,
    'bonus' => LedgerEntryType.bonus,
    'withdrawal' => LedgerEntryType.withdrawal,
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
