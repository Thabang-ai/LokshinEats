/// What this driver is carrying, and what they have finished.
///
/// The active ones come first and are the point of the screen: a driver
/// usually has one, occasionally two, and needs to get back to whichever they
/// are in the middle of without hunting for it.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/theme/app_theme.dart';
import 'package:lokshineats_core/utils/money.dart';
import 'package:lokshineats_core/widgets/async_states.dart';

import '../providers/delivery_providers.dart';
import '../widgets/delivery_card.dart';
import 'delivery_page.dart';

class MyDeliveriesPage extends ConsumerWidget {
  const MyDeliveriesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final mine = ref.watch(myDeliveriesProvider);
    final notifier = ref.read(myDeliveriesProvider.notifier);

    return mine.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => ErrorState(
        error: error,
        onRetry: () => ref.invalidate(myDeliveriesProvider),
      ),
      data: (state) {
        final active = activeOf(state);
        final finished = finishedOf(state);
        final owed = owedOf(state);

        return RefreshIndicator(
          onRefresh: notifier.refresh,
          child: state.isEmpty
              ? ListView(
                  padding: const EdgeInsets.fromLTRB(24, 80, 24, 24),
                  children: const [
                    EmptyState(
                      title: 'Nothing on the go',
                      subtitle:
                          'Claim a delivery from Available and it shows up '
                          'here.',
                      emoji: '📦',
                    ),
                  ],
                )
              : ListView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                  children: [
                    if (owed.isNotEmpty) ...[
                      _OwedNotice(
                        total: owedTotalOf(state),
                        kitchens: owed.length,
                        dueAt: nextCashDueOf(state),
                        disputed: anyCashDisputed(state),
                      ),
                      const SizedBox(height: 10),
                      for (final delivery in owed)
                        DeliveryCard(
                          delivery: delivery,
                          onTap: () => _open(context, delivery.id),
                        ),
                      const SizedBox(height: 12),
                    ],
                    if (active.isNotEmpty) ...[
                      Text(
                        'On the go',
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 10),
                      for (final delivery in active)
                        DeliveryCard(
                          delivery: delivery,
                          onTap: () => _open(context, delivery.id),
                        ),
                    ],
                    if (finished.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Text(
                        'Finished',
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 10),
                      for (final delivery in finished)
                        DeliveryCard(
                          delivery: delivery,
                          onTap: () => _open(context, delivery.id),
                        ),
                    ],
                  ],
                ),
        );
      },
    );
  }
}

void _open(BuildContext context, String orderId) {
  Navigator.of(context).push(
    MaterialPageRoute<void>(builder: (_) => DeliveryPage(orderId: orderId)),
  );
}

/// Money this driver is holding that belongs to a kitchen.
///
/// Said plainly and at the top, because it is the one thing on this screen
/// somebody else is waiting for.
/// A deadline written the way somebody standing in the street reads it.
///
/// "by 18:00 today" means something; "by 2026-10-30T18:00:00Z" does not.
String _when(DateTime due) {
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(due.year, due.month, due.day);
  final clock =
      '${due.hour.toString().padLeft(2, '0')}:'
      '${due.minute.toString().padLeft(2, '0')}';

  final days = day.difference(today).inDays;
  if (days == 0) return '$clock today';
  if (days == 1) return '$clock tomorrow';

  const names = [
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
    'Sun',
  ];
  return '$clock on ${names[due.weekday - 1]}';
}

/// What the driver owes, and what happens if it stays that way.
///
/// The amount alone was a statement with no consequence attached. A driver
/// holding a kitchen's takings is holding somebody else's money, and the
/// platform now stops them taking more work - and then suspends them - if it
/// stays in their pocket. Saying so here is the point: nobody should learn
/// about the deadline by being locked out.
class _OwedNotice extends StatelessWidget {
  const _OwedNotice({
    required this.total,
    required this.kitchens,
    this.dueAt,
    this.disputed = false,
  });

  final double total;
  final int kitchens;
  final DateTime? dueAt;

  /// A kitchen says money the driver handed over never arrived.
  final bool disputed;

  bool get _overdue => dueAt != null && dueAt!.isBefore(DateTime.now());

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = StatusColors.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: (_overdue ? status.danger : status.warning).withValues(
          alpha: 0.12,
        ),
        borderRadius: BorderRadius.circular(AppTheme.radius),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            _overdue ? Icons.error_outline : Icons.payments_outlined,
            color: _overdue ? status.danger : status.warning,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  kitchens == 1
                      ? 'You still owe a kitchen ${formatRands(total)}.'
                      : 'You still owe $kitchens kitchens ${formatRands(total)}.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (disputed) ...[
                  const SizedBox(height: 2),
                  Text(
                    'A kitchen says money you handed over never arrived. '
                    'LokshinEats is looking into it, and it stays on your '
                    'books until it is settled.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: status.danger,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
                if (dueAt != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    _overdue
                        ? 'Overdue. You cannot take another delivery until '
                              'the kitchen has it, and your account can be '
                              'suspended.'
                        : 'Hand it over by ${_when(dueAt!)} or you cannot take '
                              'another delivery.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: _overdue ? status.danger : null,
                      fontWeight: _overdue ? FontWeight.w700 : null,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
