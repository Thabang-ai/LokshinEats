/// The inbox, and the unread count on the bell.
///
/// The count polls, like order tracking does: the API cannot push to a
/// browser tab, and a bell that only updates when you open the inbox is not
/// telling you anything. Every thirty seconds is enough for news that is
/// minutes apart, and it stops while the app is out of sight.
library;

import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/providers.dart';

import '../models/app_notification.dart';
import '../repositories/notification_repository.dart';

Duration? _noRetry(int retryCount, Object error) => null;

final notificationRepositoryProvider = Provider<NotificationRepository>((ref) {
  return NotificationRepository(ref.watch(apiClientProvider));
});

class InboxState {
  const InboxState({
    required this.notifications,
    required this.unread,
    required this.nextCursor,
  });

  static const empty = InboxState(
    notifications: [],
    unread: 0,
    nextCursor: null,
  );

  final List<AppNotification> notifications;
  final int unread;
  final String? nextCursor;

  bool get hasMore => nextCursor != null;
}

class InboxNotifier extends AsyncNotifier<InboxState> {
  static const pollInterval = Duration(seconds: 30);

  Timer? _timer;
  bool _inFlight = false;

  @override
  Future<InboxState> build() async {
    // Rebuilt on sign-in and sign-out: one account never sees another's.
    if (!ref.watch(isSignedInProvider)) return InboxState.empty;

    final lifecycle = AppLifecycleListener(
      onHide: () => _timer?.cancel(),
      onShow: () {
        unawaited(refresh());
        _schedule();
      },
    );
    ref.onDispose(() {
      _timer?.cancel();
      lifecycle.dispose();
    });

    final page = await ref.read(notificationRepositoryProvider).fetch();
    _schedule();
    return _fromPage(page);
  }

  void _schedule() {
    _timer?.cancel();
    _timer = Timer.periodic(pollInterval, (_) => unawaited(refresh()));
  }

  static InboxState _fromPage(InboxPage page) => InboxState(
    notifications: page.notifications,
    unread: page.unread,
    nextCursor: page.nextCursor,
  );

  /// Ask again now - after a push arrives, or a pull to refresh.
  Future<void> refresh() async {
    if (_inFlight) return;
    _inFlight = true;
    try {
      final page = await ref.read(notificationRepositoryProvider).fetch();
      if (ref.mounted) state = AsyncData(_fromPage(page));
    } catch (_) {
      // Keep what is shown; the next poll tries again. A bell that blanks
      // because one request failed would be worse than one a little behind.
    } finally {
      _inFlight = false;
    }
  }

  /// Mark one read. The badge drops at once and the API is told; if the API
  /// refuses, the next poll puts the truth back.
  Future<void> markRead(String id) async {
    final current = state.value;
    if (current == null) return;

    final target = current.notifications.where((n) => n.id == id).firstOrNull;
    if (target == null || target.isRead) return;

    state = AsyncData(
      InboxState(
        notifications: [
          for (final n in current.notifications)
            n.id == id ? n.markedRead() : n,
        ],
        unread: (current.unread - 1).clamp(0, 1 << 30),
        nextCursor: current.nextCursor,
      ),
    );

    try {
      await ref.read(notificationRepositoryProvider).markRead(id);
    } catch (_) {
      unawaited(refresh());
    }
  }

  Future<void> markAllRead() async {
    final current = state.value;
    if (current == null || current.unread == 0) return;

    state = AsyncData(
      InboxState(
        notifications: [for (final n in current.notifications) n.markedRead()],
        unread: 0,
        nextCursor: current.nextCursor,
      ),
    );

    try {
      await ref.read(notificationRepositoryProvider).markAllRead();
    } catch (_) {
      unawaited(refresh());
    }
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || !current.hasMore) return;

    final page = await ref
        .read(notificationRepositoryProvider)
        .fetch(cursor: current.nextCursor);
    if (!ref.mounted) return;

    state = AsyncData(
      InboxState(
        notifications: [...current.notifications, ...page.notifications],
        unread: page.unread,
        nextCursor: page.nextCursor,
      ),
    );
  }
}

final inboxProvider = AsyncNotifierProvider<InboxNotifier, InboxState>(
  InboxNotifier.new,
  retry: _noRetry,
);
