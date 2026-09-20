/// The customer's profile, via the API.
///
/// Firebase creates the account; the API owns the profile and the role. A
/// customer who has signed up but whose profile call has not completed exists
/// in Firebase and not in the API — the app treats that as a state to finish
/// rather than an error, because it is recoverable by retrying the call.
library;

import 'package:lokshineats_core/network/api_client.dart';
import 'package:lokshineats_core/network/api_exception.dart';
import 'package:lokshineats_core/auth/user_profile.dart';

class ProfileRepository {
  const ProfileRepository(this._client);

  final ApiClient _client;

  /// The signed-in customer's profile, or null if they have not made one.
  ///
  /// A 404 is the API's way of saying "authenticated, but no profile yet",
  /// which is an expected state after sign-up rather than a failure.
  Future<UserProfile?> fetchMe() async {
    try {
      final response = await _client.get<UserProfile>(
        '/api/v1/users/me',
        authenticated: true,
        decode: (json) => UserProfile.fromJson(json! as Map<String, dynamic>),
      );
      return response.data;
    } on ApiException catch (error) {
      if (error.code == ApiErrorCode.notFound) return null;
      rethrow;
    }
  }

  /// Create the profile that every other endpoint authorises against.
  ///
  /// [role] is the only role this account will ever have asked for itself: the
  /// API accepts `customer` or `driver` here and nothing else, so no app can
  /// sign someone up as a vendor or an admin. Which of the two is a property
  /// of the app doing the asking — see `signUpRoleProvider`.
  Future<UserProfile> createMe({
    required String displayName,
    String? phone,
    String? role,
  }) async {
    final response = await _client.post<UserProfile>(
      '/api/v1/users/me',
      body: {
        'displayName': displayName.trim(),
        if (phone != null && phone.trim().isNotEmpty) 'phone': phone.trim(),
        'role': ?role,
      },
      decode: (json) => UserProfile.fromJson(json! as Map<String, dynamic>),
    );

    return response.data;
  }

  /// Save the profile form.
  ///
  /// Every field is sent every time, so the saved profile is exactly what the
  /// form showed. `address: null` is how the API is told to remove a saved
  /// address; leaving the key out would silently keep the old one.
  ///
  /// The name also updates the Firebase Auth record server-side, which is the
  /// name the web app shows - so both apps greet the customer the same way.
  Future<UserProfile> updateMe({
    required String displayName,
    required String phone,
    required ProfileAddress? address,
  }) async {
    final response = await _client.patch<UserProfile>(
      '/api/v1/users/me',
      body: {
        'displayName': displayName.trim(),
        // The API's pattern has no room for spaces; people type them anyway.
        'phone': phone.replaceAll(' ', ''),
        'address': address?.toJson(),
      },
      decode: (json) => UserProfile.fromJson(json! as Map<String, dynamic>),
    );

    return response.data;
  }
}
