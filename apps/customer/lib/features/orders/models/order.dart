/// An order, as the API returns it.
///
/// Every money field here is the server's. The app sends product ids,
/// quantities and an address; the server reads the prices, applies the
/// kitchen's delivery fee, enforces its minimum, and returns what the customer
/// actually owes. So the total on this object is authoritative in a way the
/// basket's running total never is.
library;

enum PaymentMethod {
  cash,
  yoco,
  ozow;

  /// The wire value the API expects.
  String get wire => name;

  String get label => switch (this) {
    PaymentMethod.cash => 'Cash on delivery',
    PaymentMethod.yoco => 'Card',
    PaymentMethod.ozow => 'Instant EFT',
  };

  String get description => switch (this) {
    PaymentMethod.cash => 'Pay the driver when your food arrives',
    PaymentMethod.yoco => 'Pay now by card',
    PaymentMethod.ozow => 'Pay now from your bank account',
  };
}

/// Where an order is in its life.
///
/// Mirrors `ORDER_STATUSES` in `server/src/modules/orders/order.model.ts`. An
/// unknown value reads as [pending] — the same fallback the server's own
/// serialiser uses — so a status added server-side later degrades to "placed"
/// rather than crashing the order list.
enum OrderStatus {
  pending,
  confirmed,
  preparing,
  ready,
  pickedUp,
  delivered,
  cancelled;

  static OrderStatus fromWire(Object? value) => switch (value) {
    'confirmed' => OrderStatus.confirmed,
    'preparing' => OrderStatus.preparing,
    'ready' => OrderStatus.ready,
    'picked_up' => OrderStatus.pickedUp,
    'delivered' => OrderStatus.delivered,
    'cancelled' => OrderStatus.cancelled,
    _ => OrderStatus.pending,
  };

  /// Short, for chips and list rows.
  String get label => switch (this) {
    OrderStatus.pending => 'Placed',
    OrderStatus.confirmed => 'Accepted',
    OrderStatus.preparing => 'Preparing',
    OrderStatus.ready => 'Ready for pickup',
    OrderStatus.pickedUp => 'On the way',
    OrderStatus.delivered => 'Delivered',
    OrderStatus.cancelled => 'Cancelled',
  };

  /// A sentence for the top of the tracking screen.
  String get description => switch (this) {
    OrderStatus.pending => 'Waiting for the kitchen to accept your order.',
    OrderStatus.confirmed => 'The kitchen has accepted your order.',
    OrderStatus.preparing => 'The kitchen is making your food.',
    OrderStatus.ready => 'Your food is ready and waiting for a driver.',
    OrderStatus.pickedUp => 'Your driver is on the way.',
    OrderStatus.delivered => 'Delivered. Enjoy your food.',
    OrderStatus.cancelled => 'This order was cancelled.',
  };

  /// Still moving — worth watching for changes.
  bool get isActive =>
      this != OrderStatus.delivered && this != OrderStatus.cancelled;
}

/// One line of an order, priced at the moment it was placed.
class OrderLine {
  const OrderLine({
    required this.productId,
    required this.name,
    required this.price,
    required this.quantity,
    required this.lineTotal,
    this.specialInstructions,
  });

  factory OrderLine.fromJson(Map<String, dynamic> json) {
    final price = _money(json['price']);
    final quantity = switch (json['quantity']) {
      final num n when n.isFinite && n > 0 => n.toInt(),
      _ => 1,
    };

    return OrderLine(
      productId: json['productId'] as String? ?? '',
      name: switch (json['name']) {
        final String s when s.isNotEmpty => s,
        _ => 'Item',
      },
      price: price,
      quantity: quantity,
      // The server always sends it; the fallback only guards a hand-built
      // payload, and matches how the server derives it.
      lineTotal: json['lineTotal'] is num
          ? _money(json['lineTotal'])
          : (price * quantity * 100).round() / 100,
      specialInstructions: switch (json['specialInstructions']) {
        final String s when s.isNotEmpty => s,
        _ => null,
      },
    );
  }

  final String productId;
  final String name;
  final double price;
  final int quantity;
  final double lineTotal;
  final String? specialInstructions;
}

class DeliveryAddress {
  const DeliveryAddress({
    required this.street,
    required this.city,
    required this.postalCode,
    this.instructions,
  });

  final String street;
  final String city;
  final String postalCode;
  final String? instructions;

  Map<String, dynamic> toJson() => {
    'street': street.trim(),
    'city': city.trim(),
    'postalCode': postalCode.trim(),
    if (instructions != null && instructions!.trim().isNotEmpty)
      'instructions': instructions!.trim(),
  };

  String get oneLine =>
      [street, city, postalCode].where((p) => p.isNotEmpty).join(', ');
}

class CustomerOrder {
  const CustomerOrder({
    required this.id,
    required this.status,
    required this.paymentStatus,
    required this.paymentMethod,
    required this.storeName,
    required this.subtotal,
    required this.deliveryFee,
    required this.total,
    required this.deliveryCode,
    required this.deliveryVerified,
    required this.address,
    this.storeId = '',
    this.items = const [],
    this.driverId,
    this.cashAmount,
    this.createdAt,
    this.updatedAt,
    this.deliveredAt,
    this.refundedAmount = 0,
    this.cancellation,
  });

  factory CustomerOrder.fromJson(Map<String, dynamic> json) {
    final address = json['deliveryAddress'] as Map<String, dynamic>? ?? const {};

    return CustomerOrder(
      id: json['id'] as String? ?? '',
      status: OrderStatus.fromWire(json['status']),
      paymentStatus: json['paymentStatus'] as String? ?? 'pending',
      paymentMethod: switch (json['paymentMethod']) {
        'yoco' => PaymentMethod.yoco,
        'ozow' => PaymentMethod.ozow,
        _ => PaymentMethod.cash,
      },
      storeId: json['storeId'] as String? ?? '',
      storeName: json['storeName'] as String? ?? '',
      items: (json['items'] as List? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(OrderLine.fromJson)
          .toList(growable: false),
      subtotal: _money(json['subtotal']),
      deliveryFee: _money(json['deliveryFee']),
      total: _money(json['total']),
      // Served to the order's own customer and to nobody else — the server
      // keeps it in a collection no client can read.
      deliveryCode: json['deliveryCode'] as String?,
      deliveryVerified: json['deliveryVerified'] == true,
      driverId: switch (json['driverId']) {
        final String s when s.isNotEmpty => s,
        _ => null,
      },
      cashAmount: json['cashAmount'] is num ? _money(json['cashAmount']) : null,
      address: DeliveryAddress(
        street: address['street'] as String? ?? '',
        city: address['city'] as String? ?? '',
        postalCode: address['postalCode'] as String? ?? '',
        instructions: address['instructions'] as String?,
      ),
      createdAt: _date(json['createdAt']),
      updatedAt: _date(json['updatedAt']),
      deliveredAt: _date(json['deliveredAt']),
      refundedAmount: _money(json['refundedAmount']),
      cancellation: OrderCancellation.fromJson(json['cancellation']),
    );
  }

  final String id;
  final OrderStatus status;
  final String paymentStatus;
  final PaymentMethod paymentMethod;
  final String storeId;
  final String storeName;
  final List<OrderLine> items;
  final double subtotal;
  final double deliveryFee;
  final double total;
  final String? deliveryCode;
  final bool deliveryVerified;
  final String? driverId;

  /// The note the customer said they would pay with, on a cash order.
  final double? cashAmount;

  final DeliveryAddress address;

  /// Null only on documents too old to carry a timestamp.
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final DateTime? deliveredAt;

  /// Returned to the customer's wallet so far. Includes a goodwill top-up an
  /// admin approved, so it can exceed the cancellation's own refund.
  final double refundedAmount;

  /// How a cancelled order was settled, or null for any other order and for
  /// orders cancelled before cancellations were recorded.
  final OrderCancellation? cancellation;

  /// Money was taken up front. A cash order is only paid at the door, so a
  /// cancelled cash order never had anything to refund.
  bool get wasPrepaid =>
      paymentMethod != PaymentMethod.cash &&
      const {'paid', 'partially_refunded', 'refunded'}.contains(paymentStatus);

  bool get isPaid => paymentStatus == 'paid';

  /// Short id, for showing a customer which order they are looking at.
  String get reference =>
      id.length <= 6 ? id.toUpperCase() : id.substring(0, 6).toUpperCase();

  /// "2 × Slap Chips, 1 × Braai Pack", for a list row.
  String get itemSummary =>
      items.map((line) => '${line.quantity} × ${line.name}').join(', ');

  int get itemCount => items.fold(0, (sum, line) => sum + line.quantity);
}

double _money(Object? value) => switch (value) {
  final num n when n.isFinite => n.toDouble(),
  _ => 0,
};

/// The API sends ISO-8601 strings. Shown in the device's local time.
DateTime? _date(Object? value) =>
    value is String ? DateTime.tryParse(value)?.toLocal() : null;

/// A payment attempt.
class PaymentAttempt {
  const PaymentAttempt({
    required this.id,
    required this.status,
    required this.providerReference,
    required this.failureReason,
    this.isSandbox = false,
  });

  factory PaymentAttempt.fromJson(
    Map<String, dynamic> json, {
    Map<String, dynamic>? meta,
  }) {
    final payload = meta?['clientPayload'] as Map<String, dynamic>?;

    return PaymentAttempt(
      id: json['id'] as String? ?? '',
      status: json['status'] as String? ?? 'initiated',
      providerReference: json['providerReference'] as String?,
      failureReason: json['failureReason'] as String?,
      isSandbox: payload?['simulated'] == true,
    );
  }

  final String id;
  final String status;
  final String? providerReference;
  final String? failureReason;

  /// True when the API is running its sandbox provider, which moves no money.
  final bool isSandbox;

  bool get succeeded => status == 'succeeded';
  bool get failed => status == 'failed';
}

/// How a cancelled order was settled.
///
/// The server decides all of this from the stage the order had reached — the
/// app only explains it. Amounts are in rands.
class OrderCancellation {
  const OrderCancellation({
    required this.stage,
    required this.initiator,
    required this.customerRefund,
    required this.vendorPay,
    required this.driverPay,
    required this.settled,
  });

  static OrderCancellation? fromJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;

    return OrderCancellation(
      stage: json['stage'] as String? ?? '',
      initiator: json['initiator'] as String? ?? '',
      customerRefund: _money(json['customerRefund']),
      vendorPay: _money(json['vendorPay']),
      driverPay: _money(json['driverPay']),
      settled: json['settled'] == true,
    );
  }

  /// `before_prep`, `in_kitchen` or `on_the_way`.
  final String stage;

  /// `customer`, `vendor` or `admin`.
  final String initiator;

  /// What the cancellation itself returned, before any goodwill.
  final double customerRefund;

  /// What the kitchen was paid for food already made.
  final double vendorPay;

  /// What the driver was paid for the trip.
  final double driverPay;

  /// False for the moment between the order being cancelled and the money
  /// being moved.
  final bool settled;
}

/// What cancelling an order would cost right now, as the API works it out.
///
/// The app never calculates this itself: the tiers live on the server, and a
/// copy here would drift. [stage] goes back with the cancellation, so the API
/// can refuse if the order has moved on since the customer saw these figures.
class CancellationPreview {
  const CancellationPreview({
    required this.allowed,
    required this.customerRefund,
    required this.vendorPay,
    required this.driverPay,
    this.stage,
    this.code,
    this.reason,
  });

  factory CancellationPreview.fromJson(Map<String, dynamic> json) {
    return CancellationPreview(
      allowed: json['allowed'] == true,
      code: json['code'] as String?,
      reason: json['reason'] as String?,
      stage: json['stage'] as String?,
      customerRefund: _money(json['customerRefund']),
      vendorPay: _money(json['vendorPay']),
      driverPay: _money(json['driverPay']),
    );
  }

  final bool allowed;

  /// `terminal`, `not_permitted` or `needs_admin` when not allowed.
  final String? code;

  /// Why it is not allowed, written by the API for the customer.
  final String? reason;

  /// `before_prep`, `in_kitchen` or `on_the_way`.
  final String? stage;

  final double customerRefund;
  final double vendorPay;
  final double driverPay;
}
