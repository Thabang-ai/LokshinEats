/// Whether this driver may work yet.
///
/// Read once on sign-in and after every submission, not polled: an approval
/// is a human decision that takes hours, and the API refuses an unapproved
/// claim anyway, so the screen being a few minutes stale costs nothing.
///
/// It is also where a newly approved driver's sign-in catches up with the
/// approval. Most drivers signed up as customers first, and the role that
/// lets them take deliveries arrives with the approval - long after the
/// token in their phone was minted. The API says so; this mints a new one,
/// before the board asks for anything.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/network/api_client.dart';
import 'package:lokshineats_core/providers.dart';

import '../models/driver_verification.dart';

/// An application, and whether the token that asked for it is out of date.
typedef MyVerification = ({
  DriverVerification? verification,
  bool tokenRefreshRequired,
});

class VerificationRepository {
  const VerificationRepository(this._client);

  final ApiClient _client;

  /// This driver's application, or null if they have not made one.
  Future<MyVerification> fetchMine() async {
    final response = await _client.get<DriverVerification?>(
      '/api/v1/drivers/me',
      authenticated: true,
      decode: (json) => json == null
          ? null
          : DriverVerification.fromJson(json as Map<String, dynamic>),
    );

    return (
      verification: response.data,
      tokenRefreshRequired: response.meta?['tokenRefreshRequired'] == true,
    );
  }

  /// Submit, or resubmit. Either way it goes back into the queue.
  Future<DriverVerification> submit({
    required VehicleType vehicleType,
    required String idNumber,
    String? licenceNumber,
    String? vehicleRegistration,
  }) async {
    final response = await _client.post<DriverVerification>(
      '/api/v1/drivers/me',
      body: {
        'vehicleType': vehicleType.wire,
        'idNumber': idNumber,
        // Omitted rather than sent empty: the API rejects a bicycle that
        // claims a licence, and an empty string is a claim.
        if (vehicleType.needsPapers) 'licenceNumber': licenceNumber,
        if (vehicleType.needsPapers) 'vehicleRegistration': vehicleRegistration,
      },
      decode: (json) =>
          DriverVerification.fromJson(json! as Map<String, dynamic>),
    );
    return response.data;
  }
}

final verificationRepositoryProvider = Provider<VerificationRepository>((ref) {
  return VerificationRepository(ref.watch(apiClientProvider));
});

/// Mint a new ID token, so a role granted since sign-in reaches the API.
///
/// A provider rather than a direct call so a test can watch it happen:
/// Firebase Auth itself cannot be stood up in one.
final tokenRefresherProvider = Provider<Future<void> Function()>((ref) {
  return () => ref.read(authRepositoryProvider).idToken(forceRefresh: true);
});

class VerificationNotifier extends AsyncNotifier<DriverVerification?> {
  @override
  Future<DriverVerification?> build() async {
    // Rebuilt on sign-in and sign-out, so one driver never sees another's.
    if (!ref.watch(isSignedInProvider)) return null;
    return _fetch();
  }

  /// Fetch, and mint a new token first if this one no longer says who the
  /// driver is. Awaited rather than left running: the board is built the
  /// moment this returns, and its first request has to carry the new token
  /// or it comes back "requires the driver or admin role".
  Future<DriverVerification?> _fetch() async {
    final mine = await ref.read(verificationRepositoryProvider).fetchMine();

    if (mine.tokenRefreshRequired) {
      // Never fatal: a failed refresh leaves the driver exactly where they
      // were, and the next read asks again.
      try {
        await ref.read(tokenRefresherProvider)();
      } catch (_) {}
    }

    return mine.verification;
  }

  Future<void> submit({
    required VehicleType vehicleType,
    required String idNumber,
    String? licenceNumber,
    String? vehicleRegistration,
  }) async {
    final submitted = await ref
        .read(verificationRepositoryProvider)
        .submit(
          vehicleType: vehicleType,
          idNumber: idNumber,
          licenceNumber: licenceNumber,
          vehicleRegistration: vehicleRegistration,
        );

    state = AsyncData(submitted);
  }

  Future<void> refresh() async {
    state = await AsyncValue.guard(_fetch);
  }
}

final verificationProvider =
    AsyncNotifierProvider<VerificationNotifier, DriverVerification?>(
      VerificationNotifier.new,
    );
