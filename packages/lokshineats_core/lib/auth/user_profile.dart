/// The customer's profile, as the API stores it.
///
/// Distinct from the Firebase account: Firebase owns credentials and issues
/// the token, while this is the record the API keeps under `users/{uid}` and
/// the role every other endpoint authorises against. A customer can be signed
/// in to Firebase and not yet have one - see `needsProfileProvider`.
library;

/// A saved delivery address.
///
/// The same `{street, city, postalCode}` shape as an order's delivery address
/// and as the web profile page, so what a customer saves on either app fills
/// in checkout on both.
class ProfileAddress {
  const ProfileAddress({
    required this.street,
    required this.city,
    required this.postalCode,
  });

  /// Reads the API's shape. An address with every part empty reads as none,
  /// and anything that is not an object reads as none rather than throwing.
  static ProfileAddress? fromJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;

    String read(Object? value) => value is String ? value.trim() : '';

    final address = ProfileAddress(
      street: read(json['street']),
      city: read(json['city']),
      postalCode: read(json['postalCode']),
    );

    return address.isEmpty ? null : address;
  }

  final String street;
  final String city;
  final String postalCode;

  bool get isEmpty => street.isEmpty && city.isEmpty && postalCode.isEmpty;

  /// Every part the API requires to save it. An address saved by an older
  /// version can be missing its city or postal code.
  bool get isComplete =>
      street.isNotEmpty && city.isNotEmpty && postalCode.isNotEmpty;

  String get oneLine =>
      [street, city, postalCode].where((part) => part.isNotEmpty).join(', ');

  Map<String, dynamic> toJson() => {
    'street': street.trim(),
    'city': city.trim(),
    'postalCode': postalCode.trim(),
  };
}

class UserProfile {
  const UserProfile({
    required this.id,
    required this.email,
    required this.displayName,
    required this.phone,
    required this.address,
    required this.role,
  });

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    return UserProfile(
      id: json['id'] as String? ?? '',
      email: json['email'] as String? ?? '',
      displayName: json['displayName'] as String? ?? '',
      phone: json['phone'] as String?,
      address: ProfileAddress.fromJson(json['address']),
      role: json['role'] as String? ?? 'customer',
    );
  }

  final String id;
  final String email;
  final String displayName;
  final String? phone;
  final ProfileAddress? address;

  /// `customer`, `driver`, `vendor` or `admin`. The API decides this; the app
  /// only reads it. Attempting to set it is rejected server-side.
  final String role;

  /// First name, for greetings. Falls back to the email's local part so the
  /// UI never greets someone as an empty string.
  String get firstName {
    final trimmed = displayName.trim();
    if (trimmed.isNotEmpty) return trimmed.split(' ').first;
    final at = email.indexOf('@');
    return at > 0 ? email.substring(0, at) : 'there';
  }
}
