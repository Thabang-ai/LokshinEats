/// The kitchen's queue.
///
/// Ordered by what needs a person: cash a driver says they handed over, then
/// new orders waiting to be accepted, then what is cooking, then what is
/// waiting for a driver. Finished orders sit at the bottom, out of the way.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/theme/app_theme.dart';
import 'package:lokshineats_core/widgets/async_states.dart';

import '../../store/providers/store_providers.dart';
import '../models/kitchen_order.dart';
import '../providers/kitchen_order_providers.dart';
import '../widgets/order_ticket.dart';

class OrderQueuePage extends ConsumerWidget {
  const OrderQueuePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final queue = ref.watch(orderQueueProvider);
    final notifier = ref.read(orderQueueProvider.notifier);

    // A kitchen is registered closed, and can be closed again mid-service.
    // Either way, no new orders are coming and the screen should say so
    // rather than leaving someone waiting at an empty counter.
    final closed = ref.watch(myStoreProvider).value?.isOpen == false;

    return queue.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => ErrorState(
        error: error,
        onRetry: () => ref.invalidate(orderQueueProvider),
      ),
      data: (state) => RefreshIndicator(
        onRefresh: notifier.refresh,
        child: state.isEmpty
            ? ListView(
                padding: const EdgeInsets.fromLTRB(24, 40, 24, 24),
                children: [
                  if (closed) const _ClosedNotice(),
                  EmptyState(
                    title: closed ? 'Your kitchen is closed' : 'No orders yet',
                    subtitle: closed
                        ? 'Customers cannot order from you until you open.'
                        : 'New orders land here on their own.',
                    emoji: '🍳',
                  ),
                ],
              )
            : ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                children: [
                  if (closed) const _ClosedNotice(),
                  if (state.refreshFailed) const _StaleNotice(),
                  _Section(
                    title: 'Cash to confirm',
                    orders: state.cashToAnswer,
                    urgent: true,
                  ),
                  _Section(title: 'New', orders: state.newOrders, urgent: true),
                  _Section(title: 'Cooking', orders: state.cooking),
                  _Section(title: 'Waiting for a driver', orders: state.ready),
                  _Section(title: 'Done', orders: state.done),
                ],
              ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({
    required this.title,
    required this.orders,
    this.urgent = false,
  });

  final String title;
  final List<KitchenOrder> orders;
  final bool urgent;

  @override
  Widget build(BuildContext context) {
    if (orders.isEmpty) return const SizedBox.shrink();

    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 10, top: 4),
          child: Row(
            children: [
              Text(
                title,
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: urgent
                      ? theme.colorScheme.primary
                      : theme.colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  '${orders.length}',
                  style: theme.textTheme.labelMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: urgent
                        ? theme.colorScheme.onPrimary
                        : theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
            ],
          ),
        ),
        for (final order in orders) OrderTicket(order: order),
        const SizedBox(height: 8),
      ],
    );
  }
}

class _StaleNotice extends StatelessWidget {
  const _StaleNotice();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Text(
        'Could not reach LokshinEats just now — this queue may be out of date.',
        style: theme.textTheme.bodySmall?.copyWith(
          color: theme.colorScheme.onSurfaceVariant,
        ),
      ),
    );
  }
}

/// Says the kitchen is shut, and offers to open it.
///
/// Worth a button rather than only a pointer at the switch: a kitchen that
/// registers for the first time starts closed, and this is the one thing
/// standing between it and its first order.
class _ClosedNotice extends ConsumerStatefulWidget {
  const _ClosedNotice();

  @override
  ConsumerState<_ClosedNotice> createState() => _ClosedNoticeState();
}

class _ClosedNoticeState extends ConsumerState<_ClosedNotice> {
  bool _busy = false;

  Future<void> _open() async {
    setState(() => _busy = true);
    try {
      await ref.read(myStoreProvider.notifier).setOpen(true);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Could not open the kitchen. Try again.'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = StatusColors.of(context);

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        color: status.warning.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'You are closed',
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: status.warning,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Nobody can order from you while the kitchen is closed.',
            style: theme.textTheme.bodyMedium,
          ),
          const SizedBox(height: 10),
          FilledButton(
            onPressed: _busy ? null : _open,
            child: _busy
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Open the kitchen'),
          ),
        ],
      ),
    );
  }
}
