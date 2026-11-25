/// The kitchen, as its owner sees it.
///
/// One account owns one store, and registering it is what makes the account a
/// vendor at all — see [StoreRepository.register]. Everything a customer sees
/// on the storefront is read from here.
library;

import 'package:lokshineats_core/utils/image_url.dart';

/// Whether LokshinEats has let this kitchen trade.
///
/// Separate from [Store.isOpen], which is the owner's own switch. A kitchen
/// can be approved and closed — shut for the night — but it cannot be open
/// without being approved.
enum StoreVerification {
  pending,
  approved,
  rejected;

  static StoreVerification fromWire(Object? value) =>
      StoreVerification.values.firstWhere(
        (status) => status.name == value,
        // A kitchen registered before the review queue existed carries no
        // status at all, and has been trading for weeks. Reading that as
        // "pending" would lock its owner out of their own app.
        orElse: () => StoreVerification.approved,
      );

  bool get mayTrade => this == StoreVerification.approved;
}

/// How this kitchen decides whether it is open.
///
/// `manual` is the switch and nothing else, which is how every kitchen
/// worked until now. `scheduled` hands the decision to the opening hours,
/// with the switch still able to close early when the pots run out.
enum StoreHoursMode {
  manual,
  scheduled;

  static StoreHoursMode fromWire(Object? value) =>
      StoreHoursMode.values.firstWhere(
        (mode) => mode.name == value,
        orElse: () => StoreHoursMode.manual,
      );
}

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
    this.verification = StoreVerification.approved,
    this.verificationReason,
    this.switchedOn = false,
    this.hoursMode = StoreHoursMode.manual,
    this.openingTime,
    this.closingTime,
    this.deliveryAreas = const [],
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
      verification: StoreVerification.fromWire(json['verification']),
      verificationReason: _text(json['verificationReason']),
      // The vendor's own switch. Absent on an older API, where `isOpen` was
      // the switch and nothing else could close a kitchen.
      switchedOn: switch (json['switchedOn']) {
        final bool value => value,
        _ => json['isOpen'] == true,
      },
      hoursMode: StoreHoursMode.fromWire(json['hoursMode']),
      openingTime: _text(json['openingTime']),
      closingTime: _text(json['closingTime']),
      deliveryAreas: switch (json['deliveryAreas']) {
        final List<Object?> areas => areas.whereType<String>().toList(),
        _ => const [],
      },
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

  /// Whether LokshinEats has let this kitchen trade.
  final StoreVerification verification;

  /// Why it was turned down, in the reviewer's words.
  final String? verificationReason;

  /// The vendor's own switch, which [isOpen] alone cannot tell you about:
  /// a kitchen on scheduled hours can be switched on and still closed.
  final bool switchedOn;

  /// Whether the hours decide, or only the switch.
  final StoreHoursMode hoursMode;

  final String? openingTime;
  final String? closingTime;

  /// The areas this kitchen delivers to, its own city among them.
  ///
  /// Empty means no limit: the kitchen will go wherever a driver will take
  /// it, which is where every kitchen starts.
  final List<String> deliveryAreas;

  /// Whether the kitchen has drawn a line around where it delivers.
  bool get hasDeliveryAreas => deliveryAreas.isNotEmpty;

  /// Switched on, but the clock has closed it.
  bool get closedByHours => switchedOn && !isOpen;

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
