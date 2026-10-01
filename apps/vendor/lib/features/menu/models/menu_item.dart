/// A dish on the kitchen's menu.
///
/// The price here is what the next customer pays. Orders already placed keep
/// the name and price they were placed at, so editing or removing a dish
/// never rewrites anybody's receipt.
library;

class MenuItem {
  const MenuItem({
    required this.id,
    required this.name,
    required this.price,
    required this.category,
    required this.available,
    this.description = '',
    this.isVegetarian = false,
    this.isSpicy = false,
    this.preparationTime = 20,
    this.image,
  });

  factory MenuItem.fromJson(Map<String, dynamic> json) {
    return MenuItem(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      description: json['description'] as String? ?? '',
      price: (json['price'] as num?)?.toDouble() ?? 0,
      category: json['category'] as String? ?? 'Other',
      available: json['available'] != false,
      isVegetarian: json['isVegetarian'] == true,
      isSpicy: json['isSpicy'] == true,
      preparationTime: (json['preparationTime'] as num?)?.toInt() ?? 20,
      image: switch (json['image']) {
        final String s when s.trim().isNotEmpty => s,
        _ => null,
      },
    );
  }

  final String id;
  final String name;
  final String description;
  final double price;
  final String category;

  /// Customers can order it right now. Switching this off is how a kitchen
  /// says "sold out today" without losing the dish.
  final bool available;

  final bool isVegetarian;
  final bool isSpicy;

  /// Minutes, as the kitchen estimates them.
  final int preparationTime;
  final String? image;

  MenuItem copyWith({bool? available}) => MenuItem(
    id: id,
    name: name,
    description: description,
    price: price,
    category: category,
    available: available ?? this.available,
    isVegetarian: isVegetarian,
    isSpicy: isSpicy,
    preparationTime: preparationTime,
    image: image,
  );
}

/// What the kitchen fills in to add or change a dish.
class MenuItemDraft {
  const MenuItemDraft({
    required this.name,
    required this.price,
    required this.category,
    this.description = '',
    this.isVegetarian = false,
    this.isSpicy = false,
    this.preparationTime = 20,
  });

  final String name;
  final double price;
  final String category;
  final String description;
  final bool isVegetarian;
  final bool isSpicy;
  final int preparationTime;

  Map<String, Object?> toJson() => {
    'name': name.trim(),
    'description': description.trim(),
    // Rands to the cent. The API rejects anything finer, and a double such
    // as 45.499999 is exactly what it would reject.
    'price': (price * 100).round() / 100,
    'category': category.trim(),
    'isVegetarian': isVegetarian,
    'isSpicy': isSpicy,
    'preparationTime': preparationTime,
  };
}

/// Read a price the way a South African kitchen types it.
///
/// "45,50", "45.50", "R45.50" and "R 45" all mean the same thing. Returns
/// null for anything that is not a price to the cent, so the form can say so
/// before the API has to.
double? parseRands(String input) {
  final cleaned = input
      .trim()
      .replaceAll(RegExp(r'^[Rr]\s*'), '')
      .replaceAll(' ', '')
      .replaceAll(',', '.');

  if (!RegExp(r'^[0-9]+(\.[0-9]{1,2})?$').hasMatch(cleaned)) return null;
  return double.tryParse(cleaned);
}
