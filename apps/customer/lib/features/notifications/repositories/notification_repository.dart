/// The customer's notifications and push devices, via the API.
///
/// Every call is about the signed-in account only; there is no user id to
/// send, so there is no way to ask about anyone else's.
library;

import 'package:lokshineats_core/network/api_client.dart';

import '../models/app_notification.dart';

class InboxPage {
  const InboxPage({
    required this.notifications,
    required this.nextCursor,
    required this.unread,
  });

  final List<AppNotification> notifications;
  final String? nextCursor;

  /// Across the whole inbox, not just this page.
  final int unread;
}

class NotificationRepository {
  const NotificationRepository(this._client);

  final ApiClient _client;

  Future<InboxPage> fetch({String? cursor, int limit = 30}) async {
    final response = await _client.get<List<AppNotification>>(
      '/api/v1/notifications',
      authenticated: true,
      query: {'limit': '$limit', 'cursor': ?cursor},
      decode: (json) => decodeList(json, AppNotification.fromJson),
    );

    return InboxPage(
      notifications: response.data,
      nextCursor: response.nextCursor,
      unread: (response.meta?['unread'] as num?)?.toInt() ?? 0,
    );
  }

  Future<void> markRead(String id) async {
    await _client.post<void>('/api/v1/notifications/$id/read', decode: (_) {});
  }

  Future<void> markAllRead() async {
    await _client.post<void>('/api/v1/notifications/read-all', decode: (_) {});
  }

  /// Tell the API this device can receive push for the signed-in account.
  Future<void> registerDevice({
    required String token,
    required String platform,
  }) async {
    await _client.post<void>(
      '/api/v1/notifications/devices',
      body: {'token': token, 'platform': platform},
      decode: (_) {},
    );
  }

  /// Stop pushing to this device. Sent before signing out, while there is
  /// still a session to send it with.
  Future<void> removeDevice(String token) async {
    await _client.post<void>(
      '/api/v1/notifications/devices/remove',
      body: {'token': token},
      decode: (_) {},
    );
  }
}
