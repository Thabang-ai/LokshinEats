/// The basket.
///
/// A cart belongs to exactly one kitchen. That is not a technical limitation —
/// each order is prepared by one vendor and collected by one driver, so a
/// basket spanning two kitchens could not be delivered as a single order.
/// Adding from a different kitchen replaces the basket, with a warning.
///
/// The totals here are for display only. The order request carries product ids
/// and quantities and nothing else; the server prices it from its own records.
/// If a vendor re-priced an item while it sat in someone's basket, the amount
/// charged is the vendor's, not the one cached on this device.
library;

import '../../stores/models/product.dart';

class CartLine {
  const CartLine({
    required this.productId,
    required this.name,
    required this.unitPrice,
    required this.quantity,
    this.specialInstructions,
  });

  factory CartLine.fromProduct(Product product, {int quantity = 1}) {
    return CartLine(
      productId: product.id,
      name: product.name,
      unitPrice: product.price,
      quantity: quantity,
    );
  }

  factory CartLine.fromJson(Map<String, dynamic> json) {
    return CartLine(
      productId: _string(json['productId']),
      name: _string(json['name'], fallback: 'Item'),
      unitPrice: switch (json['unitPrice']) {
        final num n when n.isFinite => n.toDouble(),
        _ => 0,
      },
      quantity: switch (json['quantity']) {
        final num n when n.isFinite && n > 0 => n.toInt(),
        _ => 1,
      },
      specialInstructions: json['specialInstructions'] is String
          ? json['specialInstructions'] as String
          : null,
    );
  }

  final String productId;

  /// Snapshotted for display while the item sits in the basket.
  final String name;
  final double unitPrice;

  final int quantity;
  final String? specialInstructions;

  /// Indicative only — see the note at the top of this file.
  double get lineTotal => unitPrice * quantity;

  CartLine copyWith({int? quantity, String? specialInstructions}) {
    return CartLine(
      productId: productId,
      name: name,
      unitPrice: unitPrice,
      quantity: quantity ?? this.quantity,
      specialInstructions: specialInstructions ?? this.specialInstructions,
    );
  }

  Map<String, dynamic> toJson() => {
    'productId': productId,
    'name': name,
    'unitPrice': unitPrice,
    'quantity': quantity,
    if (specialInstructions != null) 'specialInstructions': specialInstructions,
  };
}

class Cart {
  const Cart({this.storeId, this.storeName = '', this.lines = const []});

  /// Parsed defensively, the way the API models are.
  ///
  /// This reads whatever is on the device, which may have been written by an
  /// older build of the app. A wrongly typed field used to throw — the
  /// notifier caught it and started the customer with an empty basket, so the
  /// symptom was a basket that silently vanished. Falling back per field keeps
  /// whatever is still readable.
  factory Cart.fromJson(Map<String, dynamic> json) {
    final storeId = json['storeId'];
    final lines = json['lines'];

    return Cart(
      storeId: storeId is String && storeId.isNotEmpty ? storeId : null,
      storeName: _string(json['storeName']),
      lines: lines is! List
          ? const []
          : lines
                .whereType<Map<String, dynamic>>()
                .map(CartLine.fromJson)
                .toList(growable: false),
    );
  }

  /// The kitchen this basket belongs to, or null when empty.
  final String? storeId;
  final String storeName;
  final List<CartLine> lines;

  static const Cart empty = Cart();

  bool get isEmpty => lines.isEmpty;
  bool get isNotEmpty => lines.isNotEmpty;

  /// Total number of items, for the badge.
  int get itemCount => lines.fold(0, (sum, line) => sum + line.quantity);

  /// Indicative food total. The delivery fee and the amount actually charged
  /// come from the server, which is why neither is computed here.
  double get subtotal => lines.fold(0, (sum, line) => sum + line.lineTotal);

  int quantityOf(String productId) {
    for (final line in lines) {
      if (line.productId == productId) return line.quantity;
    }
    return 0;
  }

  Map<String, dynamic> toJson() => {
    'storeId': storeId,
    'storeName': storeName,
    'lines': lines.map((line) => line.toJson()).toList(),
  };
}

String _string(Object? value, {String fallback = ''}) =>
    value is String && value.isNotEmpty ? value : fallback;
