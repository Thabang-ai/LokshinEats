/// The customer's orders: what is on its way, and what came before.
///
/// Orders still in progress are listed first and apart, because that is what
/// someone opening this screen is almost always looking for — the order they
/// are waiting on, and its delivery code.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import 'package:lokshineats_core/theme/app_theme.dart';
import 'package:lokshineats_core/utils/money.dart';
import 'package:lokshineats_core/widgets/async_states.dart';
import 'package:lokshineats_core/auth/sign_in_page.dart';
import 'package:lokshineats_core/auth/auth_providers.dart';
import '../models/order.dart';
import '../providers/order_tracking_providers.dart';
import 'order_tracking_page.dart';

class YourOrdersPage extends ConsumerWidget {
  const YourOrdersPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final signedIn = ref.watch(isSignedInProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Your orders')),
      body: SafeArea(
        child: signedIn ? const _OrdersBody() : const _SignedOut(),
      ),
    );
  }
}

class _OrdersBody extends ConsumerWidget {
  const _OrdersBody();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = ref.watch(myOrdersProvider);

    return orders.when(
      loading: () => const _ListSkeleton(),
      error: (error, _) => ErrorState(
        error: error,
        onRetry: () => ref.invalidate(myOrdersProvider),
      ),
      data: (state) {
        if (state.orders.isEmpty) {
          return RefreshIndicator(
            onRefresh: () => ref.refresh(myOrdersProvider.future),
            // A scrollable is what lets pull-to-refresh work on an empty list.
            child: ListView(
              children: const [
                SizedBox(height: 120),
                EmptyState(
                  title: 'No orders yet',
                  subtitle:
                      'When you order from a kitchen it will show up here, '
                      'with its delivery code.',
                  emoji: '🧾',
                ),
              ],
            ),
          );
        }

        final active = state.active;
        final past = state.past;

        return RefreshIndicator(
          onRefresh: () => ref.refresh(myOrdersProvider.future),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
            children: [
              if (active.isNotEmpty) ...[
                const _SectionHeading('In progress'),
                for (final order in active) _OrderRow(order: order),
                const SizedBox(height: 12),
              ],
              if (past.isNotEmpty) ...[
                const _SectionHeading('Past orders'),
                for (final order in past) _OrderRow(order: order),
              ],
              if (state.hasMore || state.loadMoreFailed)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Center(
                    child: state.isLoadingMore
                        ? const Padding(
                            padding: EdgeInsets.all(12),
                            child: CircularProgressIndicator(),
                          )
                        : TextButton.icon(
                            onPressed: () =>
                                ref.read(myOrdersProvider.notifier).loadMore(),
                            icon: Icon(
                              state.loadMoreFailed
                                  ? Icons.refresh_rounded
                                  : Icons.expand_more_rounded,
                            ),
                            label: Text(
                              state.loadMoreFailed
                                  ? 'Could not load more — try again'
                                  : 'Show older orders',
                            ),
                          ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _SectionHeading extends StatelessWidget {
  const _SectionHeading(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 8, 4, 10),
      child: Text(
        label,
        style: Theme.of(
          context,
        ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800),
      ),
    );
  }
}

class _OrderRow extends ConsumerWidget {
  const _OrderRow({required this.order});

  final CustomerOrder order;

  static final DateFormat _when = DateFormat('d MMM, HH:mm');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final placed = order.createdAt;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () async {
          await Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) => OrderTrackingPage(orderId: order.id),
            ),
          );
          // The order may have moved on while its screen was open; the list
          // should not show a stale status on the way back.
          ref.invalidate(myOrdersProvider);
        },
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      order.storeName.isEmpty ? 'Order' : order.storeName,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  OrderStatusChip(status: order.status),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                [
                  '#${order.reference}',
                  if (placed != null) _when.format(placed),
                ].join(' · '),
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              if (order.items.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  order.itemSummary,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodyMedium,
                ),
              ],
              const SizedBox(height: 8),
              Row(
                children: [
                  Text(
                    formatRands(order.total),
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const Spacer(),
                  Text(
                    order.status.isActive ? 'Track' : 'Details',
                    style: theme.textTheme.labelLarge?.copyWith(
                      color: theme.colorScheme.primary,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Icon(
                    Icons.chevron_right_rounded,
                    color: theme.colorScheme.primary,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A status as a small coloured pill. Colour carries the rough state, the
/// label carries the meaning, so the chip still reads without colour.
class OrderStatusChip extends StatelessWidget {
  const OrderStatusChip({super.key, required this.status});

  final OrderStatus status;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final colours = StatusColors.of(context);

    final (Color background, Color foreground) = switch (status) {
      OrderStatus.delivered => (
        colours.success.withValues(alpha: 0.15),
        colours.success,
      ),
      OrderStatus.cancelled => (
        scheme.surfaceContainerHighest,
        scheme.onSurfaceVariant,
      ),
      _ => (scheme.primaryContainer, scheme.onPrimaryContainer),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        status.label,
        style: Theme.of(context).textTheme.labelMedium?.copyWith(
          color: foreground,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _SignedOut extends StatelessWidget {
  const _SignedOut();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const EmptyState(
              title: 'Sign in to see your orders',
              subtitle:
                  'Your orders and their delivery codes live with your '
                  'account.',
              emoji: '🧾',
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => const SignInPage()),
              ),
              child: const Text('Sign in'),
            ),
          ],
        ),
      ),
    );
  }
}

class _ListSkeleton extends StatelessWidget {
  const _ListSkeleton();

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: 3,
      separatorBuilder: (_, _) => const SizedBox(height: 12),
      itemBuilder: (_, _) => const Card(
        child: Padding(
          padding: EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ShimmerBox(width: 180, height: 16),
              SizedBox(height: 8),
              ShimmerBox(width: 120, height: 12),
              SizedBox(height: 12),
              ShimmerBox(width: 240, height: 14),
            ],
          ),
        ),
      ),
    );
  }
}
