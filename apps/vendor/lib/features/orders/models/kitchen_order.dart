/// An order as the kitchen sees it.
///
/// The vendor's view is the docket: what to cook, for whom, and where it is
/// in the queue. The delivery code is not part of it — that belongs to the
/// customer and the door — and neither is the platform's cut.
library;

/// Where an order has got to.
///
/// The kitchen drives the first half of this and can only watch the second:
/// once a driver has collected the food, nothing the kitchen does moves it.
enum KitchenOrderStatus {
  pending,
  confirmed,
  preparing,
  ready,
  pickedUp,
  delivered,
  cancelled;

  static KitchenOrderStatus fromWire(Object? value) => switch (value) {
    'confirmed' => KitchenOrderStatus.confirmed,
    'preparing' => KitchenOrderStatus.preparing,
    'ready' => KitchenOrderStatus.ready,
    'picked_up' => KitchenOrderStatus.pickedUp,
    'delivered' => KitchenOrderStatus.delivered,
    'cancelled' => KitchenOrderStatus.cancelled,
    _ => KitchenOrderStatus.pending,
  };

  String get wire => switch (this) {
    KitchenOrderStatus.pickedUp => 'picked_up',
    _ => name,
  };

  String get label => switch (this) {
    KitchenOrderStatus.pending => 'New order',
    KitchenOrderStatus.confirmed => 'Accepted',
    KitchenOrderStatus.preparing => 'Cooking',
    KitchenOrderStatus.ready => 'Waiting for a driver',
    KitchenOrderStatus.pickedUp => 'On the way',
    KitchenOrderStatus.delivered => 'Delivered',
    KitchenOrderStatus.cancelled => 'Cancelled',
  };

  /// The kitchen still has something to do or watch.
  bool get isActive =>
      this != KitchenOrderStatus.delivered &&
      this != KitchenOrderStatus.cancelled;

  /// Waiting to be accepted or turned down.
  bool get needsAnswer => this == KitchenOrderStatus.pending;

  /// Accepted, and the food is not finished.
  bool get isInKitchen =>
      this == KitchenOrderStatus.confirmed ||
      this == KitchenOrderStatus.preparing;
}

/// One line of the docket.
class OrderLine {
  const OrderLine({
    required this.name,
    required this.quantity,
    required this.lineTotal,
    this.specialInstructions,
  });

  factory OrderLine.fromJson(Map<String, dynamic> json) {
    return OrderLine(
      name: json['name'] as String? ?? 'Item',
      quantity: (json['quantity'] as num?)?.toInt() ?? 1,
      lineTotal: _money(json['lineTotal']),
      specialInstructions: switch (json['specialInstructions']) {
        final String s when s.trim().isNotEmpty => s,
        _ => null,
      },
    );
  }

  final String name;
  final int quantity;
  final double lineTotal;

  /// What the customer asked for. Shown with the line rather than buried, so
  /// "no chilli" reaches the person actually cooking it.
  final String? specialInstructions;
}

class KitchenOrder {
  const KitchenOrder({
    required this.id,
    required this.status,
    required this.customerName,
    required this.lines,
    required this.subtotal,
    required this.total,
    required this.vendorPayout,
    required this.paymentMethod,
    required this.paymentStatus,
    required this.driverAssigned,
    this.customerPhone,
    this.cashGivenToVendor = false,
    this.vendorCashConfirmed = false,
    this.vendorCashDisputed = false,
    this.cashGivenAmount,
    this.createdAt,
  });

  factory KitchenOrder.fromJson(Map<String, dynamic> json) {
    return KitchenOrder(
      id: json['id'] as String? ?? '',
      status: KitchenOrderStatus.fromWire(json['status']),
      customerName: json['customerName'] as String? ?? '',
      customerPhone: switch (json['customerPhone']) {
        final String s when s.trim().isNotEmpty => s,
        _ => null,
      },
      lines: (json['items'] as List? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(OrderLine.fromJson)
          .toList(growable: false),
      subtotal: _money(json['subtotal']),
      total: _money(json['total']),
      vendorPayout: _money(json['vendorPayout']),
      paymentMethod: json['paymentMethod'] as String? ?? 'cash',
      paymentStatus: json['paymentStatus'] as String? ?? 'pending',
      driverAssigned: switch (json['driverId']) {
        final String s => s.isNotEmpty,
        _ => false,
      },
      cashGivenToVendor: json['cashGivenToVendor'] == true,
      vendorCashConfirmed: json['vendorCashConfirmed'] == true,
      vendorCashDisputed: json['vendorCashDisputed'] == true,
      cashGivenAmount: json['cashGivenAmount'] is num
          ? _money(json['cashGivenAmount'])
          : null,
      createdAt: switch (json['createdAt']) {
        final String s => DateTime.tryParse(s)?.toLocal(),
        _ => null,
      },
    );
  }

  final String id;
  final KitchenOrderStatus status;
  final String customerName;
  final String? customerPhone;
  final List<OrderLine> lines;
  final double subtotal;
  final double total;

  /// What this order pays the kitchen, after commission. Computed by the API.
  final double vendorPayout;

  final String paymentMethod;
  final String paymentStatus;

  /// A driver has claimed it — worth knowing before the food is finished,
  /// because it means somebody is already on the way for it.
  final bool driverAssigned;

  /// The driver says they have handed over the cash for this order.
  final bool cashGivenToVendor;
  final bool vendorCashConfirmed;
  final bool vendorCashDisputed;
  final double? cashGivenAmount;

  final DateTime? createdAt;

  bool get isCash => paymentMethod == 'cash';

  /// A driver has said they paid, and the kitchen has not answered yet.
  ///
  /// Until it does, nobody knows whether that money arrived — so this is the
  /// one thing in this app the kitchen is asked about after the food has
  /// gone.
  bool get awaitsCashAnswer =>
      cashGivenToVendor && !vendorCashConfirmed && !vendorCashDisputed;

  /// The short form for a ticket header.
  String get reference =>
      id.length <= 6 ? id : id.substring(id.length - 6).toUpperCase();

  int get itemCount =>
      lines.fold(0, (running, line) => running + line.quantity);
}

double _money(Object? value) => value is num ? value.toDouble() : 0;
