/// A kitchen customers order from.
///
/// Mirrors the API's store serialiser (`server/src/modules/stores/`). Parsing
/// is defensive in the same way the server's is: a field that is missing or
/// the wrong type falls back rather than throwing, because one malformed
/// document should not blank out the whole restaurant list.
library;

class Store {
  const Store({
    required this.id,
    required this.name,
    required this.description,
    required this.cuisine,
    required this.address,
    required this.city,
    required this.categories,
    required this.image,
    required this.rating,
    required this.reviewCount,
    required this.deliveryTime,
    required this.deliveryFee,
    required this.minOrderAmount,
    required this.isOpen,
  });

  factory Store.fromJson(Map<String, dynamic> json) {
    return Store(
      id: _string(json['id']),
      name: _string(json['name'], fallback: 'Unnamed kitchen'),
      description: _string(json['description']),
      cuisine: _string(json['cuisine']),
      address: _string(json['address']),
      city: _string(json['city']),
      categories:
          (json['categories'] as List?)?.whereType<String>().toList() ??
          const [],
      image: _nullableString(json['image'] ?? json['banner'] ?? json['logo']),
      rating: _double(json['rating']),
      reviewCount: _int(json['reviewCount']),
      deliveryTime: _string(json['deliveryTime'], fallback: '30-45 min'),
      deliveryFee: _double(json['deliveryFee']),
      minOrderAmount: _double(json['minOrderAmount']),
      isOpen: json['isOpen'] == true,
    );
  }

  final String id;
  final String name;
  final String description;
  final String cuisine;
  final String address;
  final String city;
  final List<String> categories;

  /// A URL, or an emoji the web app stored as a placeholder — callers must
  /// handle both. See [hasPhoto].
  final String? image;

  final double rating;
  final int reviewCount;
  final String deliveryTime;
  final double deliveryFee;
  final double minOrderAmount;
  final bool isOpen;

  /// Whether [image] is a real photo rather than the emoji placeholder the
  /// web app writes when a vendor uploaded nothing.
  bool get hasPhoto {
    final value = image;
    return value != null &&
        (value.startsWith('http://') || value.startsWith('https://'));
  }

  /// The emoji to show when there is no photo.
  String get placeholderEmoji {
    final value = image;
    if (value != null && value.isNotEmpty && !hasPhoto) return value;
    return '🍽️';
  }

  bool get hasRating => reviewCount > 0;
}

String _string(Object? value, {String fallback = ''}) =>
    value is String && value.isNotEmpty ? value : fallback;

String? _nullableString(Object? value) =>
    value is String && value.isNotEmpty ? value : null;

double _double(Object? value) => switch (value) {
  final num n when n.isFinite => n.toDouble(),
  _ => 0,
};

int _int(Object? value) => switch (value) {
  final num n when n.isFinite => n.toInt(),
  _ => 0,
};
