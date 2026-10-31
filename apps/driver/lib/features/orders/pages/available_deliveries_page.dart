/// The board of deliveries nobody has claimed.
///
/// Claiming is a race: several drivers see the same card and the API settles
/// it in a transaction. So the button reports what actually happened rather
/// than assuming it worked — a driver who lost the race is told here, on this
/// screen, instead of finding out at a kitchen counter.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/network/api_exception.dart';
import 'package:lokshineats_core/theme/app_theme.dart';
import 'package:lokshineats_core/utils/money.dart';
import 'package:lokshineats_core/widgets/async_states.dart';

import '../models/delivery.dart';
import '../providers/delivery_providers.dart';
import '../widgets/delivery_card.dart';
import 'delivery_page.dart';

class AvailableDeliveriesPage extends ConsumerWidget {
  const AvailableDeliveriesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final available = ref.watch(availableDeliveriesProvider);
    final notifier = ref.read(availableDeliveriesProvider.notifier);

    // A driver past the deadline on a kitchen's cash cannot claim anything -
    // the API refuses it. Showing them a board full of work and letting them
    // find that out one tap at a time is the wrong way round, so the board
    // says why instead.
    final mine = ref.watch(myDeliveriesProvider).value;
    final overdue = mine == null ? const <Delivery>[] : overdueOf(mine);
    if (overdue.isNotEmpty) {
      return _BlockedByCash(
        total: overdue.fold<double>(
          0,
          (sum, delivery) => sum + delivery.kitchenCashDue,
        ),
        kitchens: {
          for (final delivery in overdue) delivery.storeName,
        }.where((name) => name.isNotEmpty).toList(),
      );
    }

    return available.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => ErrorState(
        error: error,
        onRetry: () => ref.invalidate(availableDeliveriesProvider),
      ),
      data: (state) => RefreshIndicator(
        onRefresh: notifier.refresh,
        child: state.isEmpty
            ? const _NothingAvailable()
            : ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                children: [
                  if (state.refreshFailed) const _StaleNotice(),
                  for (final delivery in state.deliveries)
                    DeliveryCard(
                      delivery: delivery,
                      trailing: _ClaimButton(delivery: delivery),
                    ),
                ],
              ),
      ),
    );
  }
}

/// Why there is no work on this screen.
///
/// Not an empty board and not an error: money that belongs to a kitchen is
/// sitting in this driver's pocket past the day it was due, and nothing else
/// happens until it is handed over.
class _BlockedByCash extends StatelessWidget {
  const _BlockedByCash({required this.total, required this.kitchens});

  final double total;
  final List<String> kitchens;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = StatusColors.of(context);

    final who = switch (kitchens.length) {
      0 => 'a kitchen',
      1 => kitchens.first,
      _ => '${kitchens.length} kitchens',
    };

    return ListView(
      padding: const EdgeInsets.fromLTRB(24, 48, 24, 24),
      children: [
        Icon(Icons.pause_circle_outline, size: 56, color: status.danger),
        const SizedBox(height: 16),
        Text(
          'No new deliveries until you pay',
          textAlign: TextAlign.center,
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 10),
        Text(
          'You are holding ${formatRands(total)} that belongs to $who, and '
          'the time to hand it over has passed. Pay it, ask them to confirm '
          'it, and the board comes back.',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodyMedium?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 10),
        Text(
          'Leave it much longer and your account is suspended.',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodySmall?.copyWith(color: status.danger),
        ),
      ],
    );
  }
}

class _ClaimButton extends ConsumerStatefulWidget {
  const _ClaimButton({required this.delivery});

  final Delivery delivery;

  @override
  ConsumerState<_ClaimButton> createState() => _ClaimButtonState();
}

class _ClaimButtonState extends ConsumerState<_ClaimButton> {
  bool _busy = false;

  Future<void> _claim() async {
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);

    try {
      final claimed = await ref
          .read(deliveryRepositoryProvider)
          .accept(widget.delivery.id);

      messenger.showSnackBar(
        SnackBar(
          content: Text(
            claimed.status == DeliveryStatus.pickedUp
                // The kitchen had already finished, so claiming it was
                // collecting it. Say so, or the driver will look for a
                // "collected" button that is no longer there.
                ? 'Collected from ${claimed.storeName}. Deliver to '
                      '${claimed.address.street}.'
                : 'Yours. Head to ${claimed.storeName}.',
          ),
        ),
      );

      // Straight onto the delivery: it is what they just took, and it is
      // where the next thing they have to do lives.
      if (mounted) {
        await navigator.push(
          MaterialPageRoute<void>(
            builder: (_) => DeliveryPage(orderId: claimed.id),
          ),
        );
      }
    } on ApiException catch (error) {
      // Usually another driver got there first, which is ordinary and not a
      // fault worth an error screen.
      messenger.showSnackBar(SnackBar(content: Text(error.message)));
    } finally {
      // Either way the board has changed: the order is gone from it.
      if (mounted) setState(() => _busy = false);
      await ref.read(availableDeliveriesProvider.notifier).refresh();
      ref.invalidate(myDeliveriesProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: _busy ? null : _claim,
      child: _busy
          ? const SizedBox(
              height: 20,
              width: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : Text(
              widget.delivery.status.isWaitingForCollection
                  ? 'Collect this order'
                  : 'Claim this delivery',
            ),
    );
  }
}

class _NothingAvailable extends StatelessWidget {
  const _NothingAvailable();

  @override
  Widget build(BuildContext context) {
    // A ListView rather than a Center so pull-to-refresh still works on an
    // empty board, which is exactly when a driver will pull it.
    return ListView(
      padding: const EdgeInsets.fromLTRB(24, 80, 24, 24),
      children: const [
        EmptyState(
          title: 'No deliveries going right now',
          subtitle:
              'New orders appear here on their own. Pull down to check again.',
          emoji: '🛵',
        ),
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
        'Could not reach LokshinEats just now — this list may be out of date.',
        style: theme.textTheme.bodySmall?.copyWith(
          color: theme.colorScheme.onSurfaceVariant,
        ),
      ),
    );
  }
}
