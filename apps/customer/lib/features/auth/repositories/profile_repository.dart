/// The customer's profile, via the API.
///
/// Firebase creates the account; the API owns the profile and the role. A
/// customer who has signed up but whose profile call has not completed exists
/// in Firebase and not in the API — the app treats that as a state to finish
/// rather than an error, because it is recoverable by retrying the call.
library;

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../models/user_profile.dart';

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
  /// `role` is deliberately not sent: the API rejects it on this endpoint, and
  /// only allows `customer` or `driver` to be self-assigned at all. A customer
  /// app has no business asking for anything else.
  Future<UserProfile> createMe({
    required String displayName,
    String? phone,
  }) async {
    final response = await _client.post<UserProfile>(
      '/api/v1/users/me',
      body: {
        'displayName': displayName.trim(),
        if (phone != null && phone.trim().isNotEmpty) 'phone': phone.trim(),
      },
      decode: (json) => UserProfile.fromJson(json! as Map<String, dynamic>),
    );

    return response.data;
  }

  Future<UserProfile> updateMe({
    String? displayName,
    String? phone,
    String? address,
  }) async {
    final response = await _client.patch<UserProfile>(
      '/api/v1/users/me',
      body: {
        if (displayName != null) 'displayName': displayName.trim(),
        if (phone != null) 'phone': phone.trim(),
        if (address != null) 'address': address.trim(),
      },
      decode: (json) => UserProfile.fromJson(json! as Map<String, dynamic>),
    );

    return response.data;
  }
}
