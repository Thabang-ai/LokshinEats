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
  });

  factory CustomerOrder.fromJson(Map<String, dynamic> json) {
    final address = json['deliveryAddress'] as Map<String, dynamic>? ?? const {};

    return CustomerOrder(
      id: json['id'] as String? ?? '',
      status: json['status'] as String? ?? 'pending',
      paymentStatus: json['paymentStatus'] as String? ?? 'pending',
      paymentMethod: switch (json['paymentMethod']) {
        'yoco' => PaymentMethod.yoco,
        'ozow' => PaymentMethod.ozow,
        _ => PaymentMethod.cash,
      },
      storeName: json['storeName'] as String? ?? '',
      subtotal: _money(json['subtotal']),
      deliveryFee: _money(json['deliveryFee']),
      total: _money(json['total']),
      // Served to the order's own customer and to nobody else — the server
      // keeps it in a collection no client can read.
      deliveryCode: json['deliveryCode'] as String?,
      deliveryVerified: json['deliveryVerified'] == true,
      address: DeliveryAddress(
        street: address['street'] as String? ?? '',
        city: address['city'] as String? ?? '',
        postalCode: address['postalCode'] as String? ?? '',
        instructions: address['instructions'] as String?,
      ),
    );
  }

  final String id;
  final String status;
  final String paymentStatus;
  final PaymentMethod paymentMethod;
  final String storeName;
  final double subtotal;
  final double deliveryFee;
  final double total;
  final String? deliveryCode;
  final bool deliveryVerified;
  final DeliveryAddress address;

  bool get isPaid => paymentStatus == 'paid';

  /// Short id, for showing a customer which order they are looking at.
  String get reference =>
      id.length <= 6 ? id.toUpperCase() : id.substring(0, 6).toUpperCase();
}

double _money(Object? value) => switch (value) {
  final num n when n.isFinite => n.toDouble(),
  _ => 0,
};

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
