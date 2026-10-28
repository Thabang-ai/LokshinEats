/// The kitchen, as its owner sees it.
///
/// One account owns one store, and registering it is what makes the account a
/// vendor at all — see [StoreRepository.register]. Everything a customer sees
/// on the storefront is read from here.
library;

import 'package:lokshineats_core/utils/image_url.dart';

class Store {
  const Store({
    required this.id,
    required this.name,
    required this.cuisine,
    required this.address,
    required this.city,
    required this.isOpen,
    required this.deliveryFee,
    required this.minOrderAmount,
    required this.deliveryTime,
    this.description = '',
    this.phone,
    this.rating,
    this.reviewCount = 0,
    this.banner,
    this.logo,
  });

  factory Store.fromJson(Map<String, dynamic> json) {
    return Store(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      cuisine: json['cuisine'] as String? ?? '',
      address: json['address'] as String? ?? '',
      city: json['city'] as String? ?? '',
      // Absent means closed: a kitchen that is not definitely open should not
      // be sent orders it is not there to cook.
      isOpen: json['isOpen'] == true,
      deliveryFee: _money(json['deliveryFee']),
      minOrderAmount: _money(json['minOrderAmount']),
      deliveryTime: json['deliveryTime'] as String? ?? '',
      description: json['description'] as String? ?? '',
      phone: switch (json['phone']) {
        final String s when s.trim().isNotEmpty => s,
        _ => null,
      },
      rating: json['rating'] is num ? (json['rating'] as num).toDouble() : null,
      reviewCount: (json['reviewCount'] as num?)?.toInt() ?? 0,
      banner: _text(json['banner']),
      logo: _text(json['logo']),
    );
  }

  final String id;
  final String name;
  final String cuisine;
  final String address;
  final String city;

  /// Taking orders right now. The vendor turns this off to stop the queue
  /// without closing the kitchen's account.
  final bool isOpen;

  /// The wide photograph across the top of the kitchen's page.
  final String? banner;

  /// The small round one beside its name.
  final String? logo;

  /// Both as URLs a phone can load, or null where there is no photograph.
  String? get bannerUrl => resolveImageUrl(banner);
  String? get logoUrl => resolveImageUrl(logo);

  final double deliveryFee;
  final double minOrderAmount;
  final String deliveryTime;
  final String description;
  final String? phone;
  final double? rating;
  final int reviewCount;
}

double _money(Object? value) => value is num ? value.toDouble() : 0;

String? _text(Object? value) {
  if (value is! String) return null;
  final trimmed = value.trim();
  return trimmed.isEmpty ? null : trimmed;
}
