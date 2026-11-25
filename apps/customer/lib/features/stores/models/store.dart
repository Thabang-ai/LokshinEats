/// A kitchen customers order from.
///
/// Mirrors the API's store serialiser (`server/src/modules/stores/`). Parsing
/// is defensive in the same way the server's is: a field that is missing or
/// the wrong type falls back rather than throwing, because one malformed
/// document should not blank out the whole restaurant list.
library;

import 'package:lokshineats_core/utils/image_url.dart';

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
    this.deliveryAreas = const [],
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
      deliveryAreas:
          (json['deliveryAreas'] as List?)?.whereType<String>().toList() ??
          const [],
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

  /// The areas this kitchen delivers to, its own township included.
  ///
  /// Empty means no limit — it will go wherever a driver will take it, which
  /// is where every kitchen on LokshinEats started.
  final List<String> deliveryAreas;

  /// Whether this kitchen has drawn a line around where it delivers.
  bool get hasDeliveryAreas => deliveryAreas.isNotEmpty;

  /// Whether a driver from this kitchen will come to [area].
  ///
  /// An area nobody has told us about reads as yes. A customer who has not
  /// said where they live should be asked for an address, not warned off a
  /// kitchen on a guess.
  bool deliversTo(String? area) {
    if (deliveryAreas.isEmpty) return true;

    final key = _areaKey(area ?? '');
    if (key.isEmpty) return true;

    return deliveryAreas.any((listed) => _areaKey(listed) == key);
  }

  /// "Meadowlands, Dobsonville and Soweto" — for telling somebody why.
  String get areasSentence => switch (deliveryAreas.length) {
    0 => '',
    1 => deliveryAreas.first,
    _ =>
      '${deliveryAreas.sublist(0, deliveryAreas.length - 1).join(', ')} '
          'and ${deliveryAreas.last}',
  };

  /// The kitchen's photo, ready to load, or null when there is none.
  ///
  /// Vendors' photos are often stored as paths the website serves, so this
  /// resolves them rather than treating them as "no photo".
  String? get photoUrl => resolveImageUrl(image);

  /// Whether [image] is a real photo rather than the emoji placeholder the
  /// web app writes when a vendor uploaded nothing.
  bool get hasPhoto => photoUrl != null;

  /// The emoji to show when there is no photo.
  ///
  /// Only an actual stand-in is shown. A value that was meant to be a photo
  /// and could not be resolved falls back to the default, because printing a
  /// file name across a card is worse than a plain plate.
  String get placeholderEmoji {
    final value = image;
    if (isImagePlaceholder(value)) return value!.trim();
    return '🍽️';
  }

  bool get hasRating => reviewCount > 0;
}

/// An area name reduced to what distinguishes it, exactly as the API does.
///
/// Nobody types a township the same way twice — "Meadowlands ",
/// "meadowlands" — and a customer must not be warned off a kitchen over
/// spacing.
String _areaKey(String value) =>
    value.trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ');

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
