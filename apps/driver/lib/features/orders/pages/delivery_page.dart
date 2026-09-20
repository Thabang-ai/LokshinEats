/// The screen a driver works a delivery from.
///
/// One job at a time, and one action visible at a time: what the driver can
/// do next depends on where the order has got to, and offering a button the
/// API would refuse teaches a driver to distrust the app. So a delivery
/// claimed while the kitchen is still cooking says it is waiting rather than
/// offering a collect button that would come back 409.
///
/// The handover is confirmed with the code the customer reads out. The driver
/// never sees that code — it is the customer's proof that the food arrived,
/// and it is what releases everyone's money — so a wrong one is reported with
/// the attempts left rather than a flat failure.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/network/api_exception.dart';
import 'package:lokshineats_core/theme/app_theme.dart';
import 'package:lokshineats_core/utils/money.dart';
import 'package:lokshineats_core/widgets/async_states.dart';

import '../models/delivery.dart';
import '../providers/delivery_providers.dart';
import '../repositories/delivery_repository.dart';

class DeliveryPage extends ConsumerWidget {
  const DeliveryPage({super.key, required this.orderId});

  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final delivery = ref.watch(deliveryProvider(orderId));
    final notifier = ref.read(deliveryProvider(orderId).notifier);

    return Scaffold(
      appBar: AppBar(title: const Text('Delivery')),
      body: SafeArea(
        child: delivery.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => ErrorState(
            error: error,
            onRetry: () => ref.invalidate(deliveryProvider(orderId)),
          ),
          data: (data) => RefreshIndicator(
            onRefresh: notifier.refresh,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
              children: [
                _WhatNow(delivery: data),
                const SizedBox(height: 16),
                _PickupCard(delivery: data),
                const SizedBox(height: 12),
                _DropOffCard(delivery: data),
                const SizedBox(height: 12),
                _ItemsCard(delivery: data),
                const SizedBox(height: 12),
                _MoneyCard(delivery: data),
                const SizedBox(height: 24),
                DeliveryActions(delivery: data, orderId: orderId),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The one sentence a driver reads first.
class _WhatNow extends StatelessWidget {
  const _WhatNow({required this.delivery});

  final Delivery delivery;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = StatusColors.of(context);

    final (headline, detail, tint) = switch (delivery) {
      _ when delivery.status == DeliveryStatus.cancelled => (
        'This order was cancelled',
        'Nothing to deliver. It will drop off your list.',
        status.danger,
      ),
      _ when delivery.owesKitchenCash => (
        'Pay the kitchen',
        'You are holding ${formatRands(delivery.kitchenCashDue)} that belongs '
            'to ${delivery.storeName}.',
        status.warning,
      ),
      _ when delivery.status == DeliveryStatus.delivered => (
        'Delivered',
        delivery.vendorCashDisputed
            ? '${delivery.storeName} says they did not get the cash. '
                  'LokshinEats support will be in touch.'
            : 'Nice one. This delivery is done.',
        delivery.vendorCashDisputed ? status.danger : status.success,
      ),
      _ when delivery.status == DeliveryStatus.pickedUp => (
        'Take it to the customer',
        'Ask ${delivery.customerName.isEmpty ? 'the customer' : delivery.customerName} '
            'for their delivery code when you arrive.',
        theme.colorScheme.primary,
      ),
      _ when delivery.status.isWaitingForCollection => (
        'Ready for you',
        '${delivery.storeName} has the food waiting.',
        status.success,
      ),
      _ when delivery.isWaitingOnKitchen => (
        'The kitchen is still cooking',
        'Head over. You can collect as soon as they mark it ready — this '
            'screen updates on its own.',
        status.warning,
      ),
      _ => ('Delivery', delivery.status.label, theme.colorScheme.primary),
    };

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
      decoration: BoxDecoration(
        color: tint.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            headline,
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w800,
              color: tint,
            ),
          ),
          const SizedBox(height: 4),
          Text(detail, style: theme.textTheme.bodyMedium),
        ],
      ),
    );
  }
}

class _PickupCard extends StatelessWidget {
  const _PickupCard({required this.delivery});

  final Delivery delivery;

  @override
  Widget build(BuildContext context) {
    return _Card(
      title: 'Collect from',
      children: [
        Text(
          delivery.storeName,
          style: Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 4),
        Text(delivery.status.label),
      ],
    );
  }
}

class _DropOffCard extends StatelessWidget {
  const _DropOffCard({required this.delivery});

  final Delivery delivery;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final phone = delivery.customerPhone;

    return _Card(
      title: 'Deliver to',
      children: [
        Text(
          delivery.customerName.isEmpty ? 'Customer' : delivery.customerName,
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 6),
        Text(delivery.address.oneLine, style: theme.textTheme.bodyMedium),
        if (delivery.address.instructions != null) ...[
          const SizedBox(height: 10),
          // Usually the difference between one trip and three phone calls.
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                Icons.info_outline,
                size: 18,
                color: theme.colorScheme.primary,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  delivery.address.instructions!,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ],
        if (phone != null) ...[
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: SelectableText(
                  phone,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              TextButton.icon(
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: phone));
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Number copied')),
                  );
                },
                icon: const Icon(Icons.copy_rounded, size: 18),
                label: const Text('Copy'),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

class _ItemsCard extends StatelessWidget {
  const _ItemsCard({required this.delivery});

  final Delivery delivery;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return _Card(
      title: 'Check the bag',
      children: [
        for (final item in delivery.items)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(
              children: [
                SizedBox(
                  width: 34,
                  child: Text(
                    '${item.quantity}x',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                Expanded(child: Text(item.name)),
              ],
            ),
          ),
      ],
    );
  }
}

class _MoneyCard extends StatelessWidget {
  const _MoneyCard({required this.delivery});

  final Delivery delivery;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = StatusColors.of(context);

    return _Card(
      title: 'Money',
      children: [
        _Row(
          label: 'You earn',
          value: formatRands(delivery.driverPayout),
          bold: true,
          colour: status.success,
        ),
        const SizedBox(height: 6),
        if (delivery.isCash) ...[
          _Row(
            label: 'Collect from the customer',
            value: formatRands(delivery.total),
            bold: true,
          ),
          const SizedBox(height: 6),
          _Row(
            label: 'Of that, the kitchen gets',
            value: formatRands(delivery.kitchenCashDue),
          ),
          if (delivery.cashGivenToVendor) ...[
            const SizedBox(height: 10),
            Text(
              delivery.vendorCashConfirmed
                  ? '${delivery.storeName} confirmed they got it.'
                  : 'Waiting for ${delivery.storeName} to confirm they got it.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ] else
          Text(
            'The customer has already paid by card. Collect nothing at the '
            'door.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
      ],
    );
  }
}

/// Whatever this delivery's next step is, and nothing else.
class DeliveryActions extends ConsumerStatefulWidget {
  const DeliveryActions({
    super.key,
    required this.delivery,
    required this.orderId,
  });

  final Delivery delivery;
  final String orderId;

  @override
  ConsumerState<DeliveryActions> createState() => _DeliveryActionsState();
}

class _DeliveryActionsState extends ConsumerState<DeliveryActions> {
  bool _busy = false;

  /// Run an action, and let its result become what the screen shows.
  Future<void> _run(Future<Delivery> Function() action) async {
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);

    try {
      final updated = await action();
      ref.read(deliveryProvider(widget.orderId).notifier).applyResult(updated);
    } on ApiException catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(error.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirmDelivery() async {
    final code = await showDialog<String>(
      context: context,
      builder: (context) => const _CodeDialog(),
    );
    if (code == null || !mounted) return;

    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);

    try {
      final updated = await ref
          .read(deliveryRepositoryProvider)
          .confirmDelivery(widget.orderId, code);

      ref.read(deliveryProvider(widget.orderId).notifier).applyResult(updated);
      messenger.showSnackBar(
        const SnackBar(content: Text('Delivered. Nice one.')),
      );
    } on ApiException catch (error) {
      final left = attemptsRemainingIn(error);
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            left == null
                ? error.message
                : '${error.message} '
                      '$left ${left == 1 ? 'try' : 'tries'} left.',
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _release() async {
    final sure = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Give this delivery back?'),
        content: const Text(
          'It goes back on the board for another driver. You can claim it '
          'again if nobody else does.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Keep it'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Give it back'),
          ),
        ],
      ),
    );
    if (sure != true || !mounted) return;

    await _run(
      () => ref.read(deliveryRepositoryProvider).release(widget.orderId),
    );
    if (mounted) Navigator.of(context).maybePop();
  }

  @override
  Widget build(BuildContext context) {
    final delivery = widget.delivery;
    final repository = ref.read(deliveryRepositoryProvider);

    if (delivery.status == DeliveryStatus.cancelled) {
      return const SizedBox.shrink();
    }

    if (delivery.owesKitchenCash) {
      return _Action(
        busy: _busy,
        label:
            'I paid ${delivery.storeName} '
            '${formatRands(delivery.kitchenCashDue)}',
        icon: Icons.payments_outlined,
        onPressed: () =>
            _run(() => repository.recordCashHandover(widget.orderId)),
      );
    }

    if (delivery.status == DeliveryStatus.delivered) {
      return const SizedBox.shrink();
    }

    if (delivery.status == DeliveryStatus.pickedUp) {
      return _Action(
        busy: _busy,
        label: 'Confirm delivery',
        icon: Icons.check_circle_outline,
        onPressed: _confirmDelivery,
      );
    }

    if (delivery.status.isWaitingForCollection) {
      return Column(
        children: [
          _Action(
            busy: _busy,
            label: 'Collected from the kitchen',
            icon: Icons.shopping_bag_outlined,
            onPressed: () => _run(() => repository.collect(widget.orderId)),
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: _busy ? null : _release,
            child: const Text('Give this delivery back'),
          ),
        ],
      );
    }

    // Claimed early: the kitchen has not finished, so there is nothing to
    // collect yet and the only thing to offer is handing it back.
    return TextButton(
      onPressed: _busy ? null : _release,
      child: const Text('Give this delivery back'),
    );
  }
}

class _Action extends StatelessWidget {
  const _Action({
    required this.busy,
    required this.label,
    required this.icon,
    required this.onPressed,
  });

  final bool busy;
  final String label;
  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: FilledButton.icon(
        onPressed: busy ? null : onPressed,
        style: FilledButton.styleFrom(
          padding: const EdgeInsets.symmetric(vertical: 16),
        ),
        icon: busy
            ? const SizedBox(
                height: 20,
                width: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : Icon(icon),
        label: Text(label),
      ),
    );
  }
}

/// Where the driver types what the customer read out.
class _CodeDialog extends StatefulWidget {
  const _CodeDialog();

  @override
  State<_CodeDialog> createState() => _CodeDialogState();
}

class _CodeDialogState extends State<_CodeDialog> {
  final _formKey = GlobalKey<FormState>();
  final _code = TextEditingController();

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  void _submit() {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    Navigator.of(context).pop(_code.text.trim());
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Delivery code'),
      content: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Ask the customer for the code on their order.'),
            const SizedBox(height: 16),
            TextFormField(
              controller: _code,
              autofocus: true,
              keyboardType: TextInputType.number,
              maxLength: 6,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 28, letterSpacing: 8),
              decoration: const InputDecoration(
                counterText: '',
                border: OutlineInputBorder(),
                hintText: '----',
              ),
              // The API takes four to six digits; catching the shape here
              // saves the driver a round trip at the door.
              validator: (value) {
                final code = value?.trim() ?? '';
                if (!RegExp(r'^[0-9]{4,6}$').hasMatch(code)) {
                  return 'Enter the code the customer reads out.';
                }
                return null;
              },
              onFieldSubmitted: (_) => _submit(),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(onPressed: _submit, child: const Text('Confirm')),
      ],
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title.toUpperCase(),
              style: theme.textTheme.labelSmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.8,
              ),
            ),
            const SizedBox(height: 10),
            ...children,
          ],
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.label,
    required this.value,
    this.bold = false,
    this.colour,
  });

  final String label;
  final String value;
  final bool bold;
  final Color? colour;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final style = theme.textTheme.bodyMedium?.copyWith(
      fontWeight: bold ? FontWeight.w800 : FontWeight.w400,
      color: colour,
    );

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Expanded(child: Text(label, style: theme.textTheme.bodyMedium)),
        const SizedBox(width: 12),
        Text(value, style: style),
      ],
    );
  }
}
