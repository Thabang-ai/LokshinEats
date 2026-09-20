/// One order, as a ticket on the counter.
///
/// A kitchen reads this mid-service with one hand: the items are the biggest
/// thing on it, special instructions sit with the line they belong to rather
/// than in a footnote, and the only button shown is the next step.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/network/api_exception.dart';
import 'package:lokshineats_core/theme/app_theme.dart';
import 'package:lokshineats_core/utils/money.dart';

import '../models/kitchen_order.dart';
import '../providers/kitchen_order_providers.dart';

class OrderTicket extends ConsumerStatefulWidget {
  const OrderTicket({super.key, required this.order});

  final KitchenOrder order;

  @override
  ConsumerState<OrderTicket> createState() => _OrderTicketState();
}

class _OrderTicketState extends ConsumerState<OrderTicket> {
  bool _busy = false;

  Future<void> _run(Future<KitchenOrder> Function() action) async {
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);

    try {
      final updated = await action();
      ref.read(orderQueueProvider.notifier).applyResult(updated);
    } on ApiException catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(error.message)));
      // Whatever the queue thinks now, the API disagreed with it.
      await ref.read(orderQueueProvider.notifier).refresh();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _turnDown() async {
    final order = widget.order;

    final sure = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Turn this order down?'),
        content: Text(
          order.status.isInKitchen
              // Cancelling after accepting is the expensive one, and the
              // kitchen should know the price before it taps, not after.
              ? '${order.customerName.isEmpty ? 'The customer' : order.customerName} '
                    'gets a full refund and you are paid nothing for this '
                    'order, even though you have started it.'
              : 'The customer gets a full refund. Nothing has been cooked, so '
                    'nothing is lost.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Keep it'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
              foregroundColor: Theme.of(context).colorScheme.onError,
            ),
            child: const Text('Turn it down'),
          ),
        ],
      ),
    );
    if (sure != true) return;

    await _run(
      () => ref.read(kitchenOrderRepositoryProvider).cancel(widget.order.id),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = StatusColors.of(context);
    final order = widget.order;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    '#${order.reference}',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                Text(
                  formatRands(order.vendorPayout),
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: status.success,
                  ),
                ),
              ],
            ),
            Text(
              'You earn',
              style: theme.textTheme.labelSmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),

            const SizedBox(height: 12),
            for (final line in order.lines) _Line(line: line),

            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _Chip(
                  label: order.isCash
                      // The kitchen is paid by the driver, in cash, later.
                      ? 'Cash on delivery'
                      : 'Paid by card',
                  color: order.isCash ? status.warning : status.success,
                ),
                if (order.driverAssigned)
                  _Chip(label: 'Driver on the way', color: status.success),
                if (order.customerName.isNotEmpty)
                  _Chip(label: order.customerName),
              ],
            ),

            const SizedBox(height: 14),
            _Actions(
              order: order,
              busy: _busy,
              onAccept: () => _run(
                () => ref.read(kitchenOrderRepositoryProvider).accept(order.id),
              ),
              onReady: () => _run(
                () => ref
                    .read(kitchenOrderRepositoryProvider)
                    .markReady(order.id),
              ),
              onTurnDown: _turnDown,
              onCashAnswer: (received) => _run(
                () => ref
                    .read(kitchenOrderRepositoryProvider)
                    .answerCashHandover(order.id, received: received),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The next step for this ticket, and nothing else.
class _Actions extends StatelessWidget {
  const _Actions({
    required this.order,
    required this.busy,
    required this.onAccept,
    required this.onReady,
    required this.onTurnDown,
    required this.onCashAnswer,
  });

  final KitchenOrder order;
  final bool busy;
  final VoidCallback onAccept;
  final VoidCallback onReady;
  final VoidCallback onTurnDown;
  final void Function(bool received) onCashAnswer;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (order.awaitsCashAnswer) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'The driver says they paid you '
            '${formatRands(order.cashGivenAmount ?? order.subtotal)} for this '
            'order. Did you get it?',
            style: theme.textTheme.bodyMedium,
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: busy ? null : () => onCashAnswer(false),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: theme.colorScheme.error,
                  ),
                  child: const Text('No, I did not'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton(
                  onPressed: busy ? null : () => onCashAnswer(true),
                  child: const Text('Yes, got it'),
                ),
              ),
            ],
          ),
        ],
      );
    }

    if (order.status.needsAnswer) {
      return Row(
        children: [
          Expanded(
            child: OutlinedButton(
              onPressed: busy ? null : onTurnDown,
              style: OutlinedButton.styleFrom(
                foregroundColor: theme.colorScheme.error,
              ),
              child: const Text('Turn down'),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            flex: 2,
            child: FilledButton(
              onPressed: busy ? null : onAccept,
              child: _busyOr(busy, 'Accept and start cooking'),
            ),
          ),
        ],
      );
    }

    if (order.status.isInKitchen) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          FilledButton(
            onPressed: busy ? null : onReady,
            child: _busyOr(busy, 'Food is ready'),
          ),
          TextButton(
            onPressed: busy ? null : onTurnDown,
            style: TextButton.styleFrom(
              foregroundColor: theme.colorScheme.error,
            ),
            child: const Text('Cancel this order'),
          ),
        ],
      );
    }

    return Text(
      switch (order.status) {
        KitchenOrderStatus.ready =>
          order.driverAssigned
              ? 'A driver is on the way to collect it.'
              : 'Waiting for a driver to claim it.',
        KitchenOrderStatus.pickedUp => 'A driver has it.',
        KitchenOrderStatus.delivered =>
          order.vendorCashDisputed
              ? 'You said the cash never arrived. LokshinEats support will be '
                    'in touch.'
              : 'Delivered.',
        KitchenOrderStatus.cancelled => 'Cancelled.',
        _ => order.status.label,
      },
      style: theme.textTheme.bodySmall?.copyWith(
        color: theme.colorScheme.onSurfaceVariant,
      ),
    );
  }
}

Widget _busyOr(bool busy, String label) => busy
    ? const SizedBox(
        height: 20,
        width: 20,
        child: CircularProgressIndicator(strokeWidth: 2),
      )
    : Text(label);

class _Line extends StatelessWidget {
  const _Line({required this.line});

  final OrderLine line;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 36,
                child: Text(
                  '${line.quantity}x',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              Expanded(
                child: Text(
                  line.name,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          if (line.specialInstructions != null)
            Padding(
              padding: const EdgeInsets.only(left: 36, top: 2),
              child: Text(
                line.specialInstructions!,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: StatusColors.of(context).warning,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, this.color});

  final String label;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tint = color ?? theme.colorScheme.primary;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: tint.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: theme.textTheme.labelMedium?.copyWith(
          color: tint,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
