/// An order as a driver sees it.
///
/// The same order the customer and the vendor see, scoped by the API to this
/// audience: a driver gets the customer's name and phone and the address to
/// drive to, and never the delivery code — that belongs to the customer, and
/// checking it at the door is the whole point of it.
///
/// Money here is what the driver earns ([driverPayout]) and, on a cash order,
/// what they are collecting and owe the kitchen. None of it is calculated in
/// this app: the API computes every figure and this model only reads them.
library;

/// Where an order has got to.
///
/// A driver only ever sees the stages a delivery passes through; the rest are
/// here because the API can return them and an unknown status must not crash
/// the app.
enum DeliveryStatus {
  pending,
  confirmed,
  preparing,
  ready,
  pickedUp,
  delivered,
  cancelled;

  static DeliveryStatus fromWire(Object? value) => switch (value) {
    'confirmed' => DeliveryStatus.confirmed,
    'preparing' => DeliveryStatus.preparing,
    'ready' => DeliveryStatus.ready,
    'picked_up' => DeliveryStatus.pickedUp,
    'delivered' => DeliveryStatus.delivered,
    'cancelled' => DeliveryStatus.cancelled,
    _ => DeliveryStatus.pending,
  };

  String get wire => switch (this) {
    DeliveryStatus.pickedUp => 'picked_up',
    _ => name,
  };

  /// What the driver should read on a card.
  String get label => switch (this) {
    DeliveryStatus.pending => 'Waiting for the kitchen',
    DeliveryStatus.confirmed => 'Kitchen accepted',
    DeliveryStatus.preparing => 'Being cooked',
    DeliveryStatus.ready => 'Ready to collect',
    DeliveryStatus.pickedUp => 'On the way',
    DeliveryStatus.delivered => 'Delivered',
    DeliveryStatus.cancelled => 'Cancelled',
  };

  /// Still the driver's job.
  bool get isActive =>
      this != DeliveryStatus.delivered && this != DeliveryStatus.cancelled;

  /// The food is made and waiting.
  bool get isWaitingForCollection => this == DeliveryStatus.ready;
}

/// One line of the order, for checking the bag against the docket.
class DeliveryItem {
  const DeliveryItem({required this.name, required this.quantity});

  factory DeliveryItem.fromJson(Map<String, dynamic> json) {
    return DeliveryItem(
      name: json['name'] as String? ?? 'Item',
      quantity: (json['quantity'] as num?)?.toInt() ?? 1,
    );
  }

  final String name;
  final int quantity;
}

class DeliveryAddress {
  const DeliveryAddress({
    required this.street,
    required this.city,
    required this.postalCode,
    this.instructions,
  });

  factory DeliveryAddress.fromJson(Map<String, dynamic> json) {
    return DeliveryAddress(
      street: json['street'] as String? ?? '',
      city: json['city'] as String? ?? '',
      postalCode: json['postalCode'] as String? ?? '',
      instructions: switch (json['instructions']) {
        final String s when s.trim().isNotEmpty => s,
        _ => null,
      },
    );
  }

  final String street;
  final String city;
  final String postalCode;

  /// What the customer wrote about finding them. Worth showing prominently:
  /// it is usually the difference between one trip and three phone calls.
  final String? instructions;

  String get oneLine => [
    street,
    city,
    postalCode,
  ].where((part) => part.isNotEmpty).join(', ');
}

class Delivery {
  const Delivery({
    required this.id,
    required this.status,
    required this.storeName,
    required this.customerName,
    required this.address,
    required this.items,
    required this.subtotal,
    required this.total,
    required this.deliveryFee,
    required this.driverPayout,
    required this.paymentMethod,
    required this.paymentStatus,
    required this.driverId,
    this.customerPhone,
    this.cashAmount,
    this.cashGivenToVendor = false,
    this.vendorCashConfirmed = false,
    this.vendorCashDisputed = false,
    this.distanceKm,
    this.createdAt,
    this.deliveredAt,
  });

  factory Delivery.fromJson(Map<String, dynamic> json) {
    return Delivery(
      id: json['id'] as String? ?? '',
      status: DeliveryStatus.fromWire(json['status']),
      storeName: json['storeName'] as String? ?? '',
      customerName: json['customerName'] as String? ?? '',
      customerPhone: switch (json['customerPhone']) {
        final String s when s.trim().isNotEmpty => s,
        _ => null,
      },
      address: DeliveryAddress.fromJson(
        json['deliveryAddress'] as Map<String, dynamic>? ?? const {},
      ),
      items: (json['items'] as List? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(DeliveryItem.fromJson)
          .toList(growable: false),
      subtotal: _money(json['subtotal']),
      total: _money(json['total']),
      deliveryFee: _money(json['deliveryFee']),
      driverPayout: _money(json['driverPayout']),
      paymentMethod: json['paymentMethod'] as String? ?? 'cash',
      paymentStatus: json['paymentStatus'] as String? ?? 'pending',
      driverId: switch (json['driverId']) {
        final String s when s.isNotEmpty => s,
        _ => null,
      },
      cashAmount: json['cashAmount'] is num ? _money(json['cashAmount']) : null,
      cashGivenToVendor: json['cashGivenToVendor'] == true,
      vendorCashConfirmed: json['vendorCashConfirmed'] == true,
      vendorCashDisputed: json['vendorCashDisputed'] == true,
      distanceKm: json['estimatedDistanceKm'] is num
          ? (json['estimatedDistanceKm'] as num).toDouble()
          : null,
      createdAt: switch (json['createdAt']) {
        final String s => DateTime.tryParse(s)?.toLocal(),
        _ => null,
      },
      deliveredAt: switch (json['deliveredAt']) {
        final String s => DateTime.tryParse(s)?.toLocal(),
        _ => null,
      },
    );
  }

  final String id;
  final DeliveryStatus status;
  final String storeName;
  final String customerName;
  final String? customerPhone;
  final DeliveryAddress address;
  final List<DeliveryItem> items;

  /// The food, before the delivery fee. On a cash order this is what the
  /// driver owes the kitchen once the customer has paid them.
  final double subtotal;

  final double total;
  final double deliveryFee;

  /// What this delivery pays the driver. The API works it out; this is only
  /// ever read.
  final double driverPayout;

  final String paymentMethod;
  final String paymentStatus;
  final String? driverId;

  /// On a cash order, what the customer said they would pay with.
  final double? cashAmount;

  /// The driver has said they handed the kitchen its share.
  final bool cashGivenToVendor;

  /// The kitchen agreed they received it.
  final bool vendorCashConfirmed;

  /// The kitchen says they did not. A person has to sort this out; the app's
  /// job is to stop pretending it is settled.
  final bool vendorCashDisputed;

  final double? distanceKm;
  final DateTime? createdAt;
  final DateTime? deliveredAt;

  /// The driver collects the money at the door and owes the kitchen its share.
  bool get isCash => paymentMethod == 'cash';

  /// Nobody has claimed this one yet.
  bool get isUnclaimed => driverId == null;

  /// Claimed, but the kitchen has not finished cooking.
  ///
  /// A driver can claim from the moment the kitchen accepts, so this is the
  /// ordinary state of an order somebody is already driving towards. The API
  /// only allows collection from `ready`, and the screen says so rather than
  /// offering a button that would 409.
  bool get isWaitingOnKitchen =>
      status == DeliveryStatus.confirmed || status == DeliveryStatus.preparing;

  /// Still on the driver: cash collected from the customer that the kitchen
  /// has not been given yet.
  bool get owesKitchenCash =>
      isCash && status == DeliveryStatus.delivered && !cashGivenToVendor;

  /// What the driver hands the kitchen: the food, not the delivery fee.
  double get kitchenCashDue => subtotal;

  /// A short "2x Kota, 1x Chips" for a card.
  String get itemSummary => items
      .map((item) => '${item.quantity}x ${item.name}')
      .join(', ');

  int get itemCount =>
      items.fold(0, (running, item) => running + item.quantity);
}

double _money(Object? value) => value is num ? value.toDouble() : 0;
