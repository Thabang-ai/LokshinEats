/// Cancelling an order, with its cost shown first.
///
/// A cancellation is priced by how far the order has got: a full refund
/// before the kitchen starts, the food and a dispatched driver's trip paid for
/// after, no refund once the driver has collected it. So this never cancels on
/// one tap. It asks the API what cancelling would cost right now, says so in
/// plain terms, and only cancels once the customer has seen that and agreed.
///
/// The figures are the server's. The stage they were worked out for goes back
/// with the cancellation, and the API refuses if the order has moved on in the
/// meantime — so the price a customer confirms is the price they get.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/utils/money.dart';
import '../models/order.dart';
import '../providers/checkout_providers.dart';

class CancelOrderButton extends ConsumerStatefulWidget {
  const CancelOrderButton({
    super.key,
    required this.order,
    required this.onOrderChanged,
  });

  final CustomerOrder order;

  /// Called after a cancellation, and when the order turned out to have moved
  /// on — so whoever shows the order can refresh it.
  final VoidCallback onOrderChanged;

  @override
  ConsumerState<CancelOrderButton> createState() => _CancelOrderButtonState();
}

class _CancelOrderButtonState extends ConsumerState<CancelOrderButton> {
  bool _busy = false;

  Future<void> _start() async {
    final repository = ref.read(orderRepositoryProvider);
    final messenger = ScaffoldMessenger.of(context);

    try {
      final preview = await _whileBusy(
        () => repository.previewCancellation(widget.order.id),
      );
      if (!mounted) return;

      final stage = preview.stage;
      if (!preview.allowed || stage == null) {
        await _explainRefusal(preview);
        return;
      }

      final confirmed = await _confirm(preview);
      if (confirmed != true || !mounted) return;

      await _whileBusy(
        () => repository.cancelOrder(widget.order.id, expectedStage: stage),
      );

      messenger.showSnackBar(const SnackBar(content: Text('Order cancelled')));
      widget.onOrderChanged();
    } on ApiException catch (error) {
      // Most often the order moved on while the confirmation was open. The
      // API's message says so; refresh so the screen shows where it is now.
      messenger.showSnackBar(
        SnackBar(content: Text(error.firstFieldError ?? error.message)),
      );
      if (error.code == ApiErrorCode.conflict) widget.onOrderChanged();
    }
  }

  /// Show progress on the button for as long as [call] is in flight.
  ///
  /// Only for the waiting on the network. While a dialog is up the work is
  /// waiting on the customer, and a button spinning away behind it would say
  /// something is happening when nothing is.
  Future<T> _whileBusy<T>(Future<T> Function() call) async {
    setState(() => _busy = true);
    try {
      return await call();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _explainRefusal(CancellationPreview preview) {
    return showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('This order can’t be cancelled here'),
        content: Text(
          preview.reason ?? 'Contact LokshinEats support to cancel this order.',
        ),
        actions: [
          FilledButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  Future<bool?> _confirm(CancellationPreview preview) {
    final lines = describeCancellationPreview(preview, widget.order);

    return showDialog<bool>(
      context: context,
      builder: (context) {
        final theme = Theme.of(context);

        return AlertDialog(
          title: const Text('Cancel this order?'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final line in lines)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(line, style: theme.textTheme.bodyMedium),
                ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Keep order'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(true),
              style: FilledButton.styleFrom(
                backgroundColor: theme.colorScheme.error,
                foregroundColor: theme.colorScheme.onError,
              ),
              child: const Text('Cancel order'),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return OutlinedButton.icon(
      onPressed: _busy ? null : _start,
      style: OutlinedButton.styleFrom(
        foregroundColor: scheme.error,
        side: BorderSide(color: scheme.error.withValues(alpha: 0.6)),
        padding: const EdgeInsets.symmetric(vertical: 14),
      ),
      icon: _busy
          ? const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : const Icon(Icons.close_rounded),
      label: const Text('Cancel order'),
    );
  }
}

/// What cancelling would mean, one sentence per line, for the confirmation.
///
/// Public so the wording can be tested against every tier.
List<String> describeCancellationPreview(
  CancellationPreview preview,
  CustomerOrder order,
) {
  // Nothing was taken up front, so there is no money to talk about.
  if (order.paymentMethod == PaymentMethod.cash || !order.isPaid) {
    return const [
      'You haven’t been charged for this order, so there’s nothing to refund.',
    ];
  }

  switch (preview.stage) {
    case 'before_prep':
      return [
        'The kitchen hasn’t started yet, so you’ll get your full '
            '${formatRands(preview.customerRefund)} back in your LokshinEats wallet.',
      ];

    case 'in_kitchen':
      return [
        preview.customerRefund > 0
            ? 'You’ll get ${formatRands(preview.customerRefund)} back in your '
                  'LokshinEats wallet.'
            : 'You won’t get a refund.',
        if (preview.vendorPay > 0)
          '${formatRands(preview.vendorPay)} pays the kitchen for food that is '
              'already being made.',
        if (preview.driverPay > 0)
          '${formatRands(preview.driverPay)} pays your driver, who is already '
              'on the way to collect it.',
      ];

    case 'on_the_way':
      return const [
        'There’s no refund: your driver has already collected your food, so the '
            'kitchen and the driver are paid in full.',
      ];

    default:
      return const ['This order will be cancelled.'];
  }
}
