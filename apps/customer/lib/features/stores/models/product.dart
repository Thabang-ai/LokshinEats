/// A menu item.
///
/// Mirrors the API's product serialiser. Note what is *not* here: nothing the
/// app sends back when ordering includes a price. The order request carries
/// product ids and quantities only, and the server prices it from these same
/// records — so a stale price on screen becomes a corrected total, never an
/// underpayment.
library;

import 'package:lokshineats_core/utils/image_url.dart';

class Product {
  const Product({
    required this.id,
    required this.storeId,
    required this.name,
    required this.description,
    required this.price,
    required this.category,
    required this.image,
    required this.available,
    required this.isVegetarian,
    required this.isSpicy,
    required this.preparationTime,
  });

  factory Product.fromJson(Map<String, dynamic> json) {
    return Product(
      id: json['id'] as String? ?? '',
      storeId: json['storeId'] as String? ?? '',
      name: json['name'] as String? ?? 'Item',
      description: json['description'] as String? ?? '',
      price: switch (json['price']) {
        final num n when n.isFinite => n.toDouble(),
        _ => 0,
      },
      category: json['category'] as String? ?? '',
      // Kept as stored. A path the website serves is still a photo; it is
      // resolved in [photoUrl] rather than thrown away here.
      image: switch (json['image']) {
        final String s when s.trim().isNotEmpty => s.trim(),
        _ => null,
      },
      // Absent means orderable: items written before the flag existed should
      // not silently vanish from menus. Matches the server's serialiser.
      available: json['available'] != false,
      isVegetarian: json['isVegetarian'] == true,
      isSpicy: json['isSpicy'] == true,
      preparationTime: switch (json['preparationTime']) {
        final num n when n.isFinite => n.toInt(),
        _ => 20,
      },
    );
  }

  final String id;
  final String storeId;
  final String name;
  final String description;
  final double price;
  final String category;
  final String? image;
  final bool available;
  final bool isVegetarian;
  final bool isSpicy;
  final int preparationTime;

  /// The dish's photo, ready to load, or null when there is none.
  String? get photoUrl => resolveImageUrl(image);
}
