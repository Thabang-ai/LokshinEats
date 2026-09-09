/// The customer's profile, as the API stores it.
///
/// Distinct from the Firebase account: Firebase owns credentials and issues
/// the token, while this is the record the API keeps under `users/{uid}` and
/// the role every other endpoint authorises against. A customer can be signed
/// in to Firebase and not yet have one — see `AuthState.needsProfile`.
library;

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
      address: json['address'] as String?,
      role: json['role'] as String? ?? 'customer',
    );
  }

  final String id;
  final String email;
  final String displayName;
  final String? phone;
  final String? address;

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
