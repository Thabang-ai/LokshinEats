/// Whether this driver may work yet.
///
/// Read once on sign-in and after every submission, not polled: an approval
/// is a human decision that takes hours, and the API refuses an unapproved
/// claim anyway, so the screen being a few minutes stale costs nothing.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/network/api_client.dart';
import 'package:lokshineats_core/providers.dart';

import '../models/driver_verification.dart';

class VerificationRepository {
  const VerificationRepository(this._client);

  final ApiClient _client;

  /// This driver's application, or null if they have not made one.
  Future<DriverVerification?> fetchMine() async {
    final response = await _client.get<DriverVerification?>(
      '/api/v1/drivers/me',
      authenticated: true,
      decode: (json) => json == null
          ? null
          : DriverVerification.fromJson(json as Map<String, dynamic>),
    );
    return response.data;
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

class VerificationNotifier extends AsyncNotifier<DriverVerification?> {
  @override
  Future<DriverVerification?> build() async {
    // Rebuilt on sign-in and sign-out, so one driver never sees another's.
    if (!ref.watch(isSignedInProvider)) return null;
    return ref.read(verificationRepositoryProvider).fetchMine();
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
    state = await AsyncValue.guard(
      () => ref.read(verificationRepositoryProvider).fetchMine(),
    );
  }
}

final verificationProvider =
    AsyncNotifierProvider<VerificationNotifier, DriverVerification?>(
      VerificationNotifier.new,
    );
