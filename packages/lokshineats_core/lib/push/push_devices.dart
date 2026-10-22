/// Telling the API which device to push to.
///
/// The same two calls for every app. The account is never sent: the API binds
/// the device to whoever the request is authenticated as, so one app cannot
/// register a device for somebody else, and no call here can read a token
/// back - not even its own.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../network/api_client.dart';
import '../providers.dart';
import 'push_messaging.dart';

class PushDeviceRepository {
  const PushDeviceRepository(this._client);

  final ApiClient _client;

  Future<void> register({
    required String token,
    required String platform,
    required PushApp app,
  }) async {
    await _client.post<void>(
      '/api/v1/notifications/devices',
      body: {'token': token, 'platform': platform, 'app': app.wire},
      decode: (_) {},
    );
  }

  /// Stop pushing to this device, for the account signing out.
  Future<void> remove(String token) async {
    await _client.post<void>(
      '/api/v1/notifications/devices/remove',
      body: {'token': token},
      decode: (_) {},
    );
  }
}

final pushDeviceRepositoryProvider = Provider<PushDeviceRepository>((ref) {
  return PushDeviceRepository(ref.watch(apiClientProvider));
});
