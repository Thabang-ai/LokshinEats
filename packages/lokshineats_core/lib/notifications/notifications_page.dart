/// What happened, newest first. The same inbox in all three apps.
///
/// What tapping one does differs: a customer wants the order they are
/// waiting for, with the delivery code on it; a kitchen or a driver wants
/// the screen where that work lives. So the destination is supplied by the
/// app through [notificationTapProvider], and this only marks it read and
/// hands over the order it was about.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../widgets/async_states.dart';

import 'app_notification.dart';
import 'notification_providers.dart';

/// What an app does when a notification is tapped.
///
/// Given the context it was tapped in and the order it concerns, if any. The
/// default does nothing beyond marking it read, which is right for an app
/// with nowhere in particular to go.
typedef NotificationTap = void Function(BuildContext context, String? orderId);

final notificationTapProvider = Provider<NotificationTap>(
  (ref) => (context, orderId) {},
);

class NotificationsPage extends ConsumerWidget {
  const NotificationsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final inbox = ref.watch(inboxProvider);
    final notifier = ref.read(inboxProvider.notifier);
    final unread = inbox.value?.unread ?? 0;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          if (unread > 0)
            TextButton(
              onPressed: notifier.markAllRead,
              child: const Text('Mark all read'),
            ),
        ],
      ),
      body: SafeArea(
        child: inbox.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => ErrorState(
            error: error,
            onRetry: () => ref.invalidate(inboxProvider),
          ),
          data: (state) => RefreshIndicator(
            onRefresh: notifier.refresh,
            child: state.notifications.isEmpty
                ? ListView(
                    padding: const EdgeInsets.fromLTRB(24, 80, 24, 24),
                    children: const [
                      EmptyState(
                        title: 'Nothing yet',
                        subtitle:
                            'When a kitchen takes your order, or your food is '
                            'on its way, you will hear about it here.',
                        emoji: '🔔',
                      ),
                    ],
                  )
                : ListView(
                    padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
                    children: [
                      for (final n in state.notifications)
                        _NotificationTile(notification: n),
                      if (state.hasMore)
                        Center(
                          child: TextButton(
                            onPressed: notifier.loadMore,
                            child: const Text('Show older'),
                          ),
                        ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}

class _NotificationTile extends ConsumerWidget {
  const _NotificationTile({required this.notification});

  final AppNotification notification;

  IconData get _icon => switch (notification.kind) {
    NotificationKind.orderAccepted => Icons.soup_kitchen_outlined,
    NotificationKind.orderOnTheWay => Icons.delivery_dining_outlined,
    NotificationKind.orderDelivered => Icons.check_circle_outline,
    NotificationKind.orderCancelled => Icons.cancel_outlined,
    NotificationKind.other => Icons.notifications_none,
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final unread = !notification.isRead;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      color: unread
          ? theme.colorScheme.primaryContainer.withValues(alpha: 0.35)
          : null,
      child: ListTile(
        leading: Icon(_icon, color: theme.colorScheme.primary),
        title: Text(
          notification.title,
          style: theme.textTheme.titleSmall?.copyWith(
            fontWeight: unread ? FontWeight.w800 : FontWeight.w600,
          ),
        ),
        subtitle: Text(notification.body),
        trailing: unread
            ? Semantics(
                label: 'Unread',
                child: Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primary,
                    shape: BoxShape.circle,
                  ),
                ),
              )
            : null,
        onTap: () {
          ref.read(inboxProvider.notifier).markRead(notification.id);
          ref.read(notificationTapProvider)(context, notification.orderId);
        },
      ),
    );
  }
}
