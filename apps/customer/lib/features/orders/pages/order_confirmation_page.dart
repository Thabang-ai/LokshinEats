/// What the customer sees once the order exists.
///
/// Two things on this screen only the server can tell us, and both are shown
/// here because they are the ones that matter:
///
///  * The total. The app sent no prices, so this is the first time the customer
///    sees what they actually owe.
///  * The delivery code. It lives in `orderSecrets/{orderId}`, a collection no
///    client rule matches, and the API serves it to this order's own customer
///    and to admins — never to the driver. The driver types it in; the server
///    compares. That is what makes "delivered" mean the customer was there.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/money.dart';
import '../models/order.dart';
import '../providers/checkout_providers.dart';

class OrderConfirmationPage extends ConsumerStatefulWidget {
  const OrderConfirmationPage({super.key, required this.order});

  /// The order as the server returned it at the end of checkout.
  final CustomerOrder order;

  @override
  ConsumerState<OrderConfirmationPage> createState() =>
      _OrderConfirmationPageState();
}

class _OrderConfirmationPageState
    extends ConsumerState<OrderConfirmationPage> {
  late CustomerOrder _order = widget.order;
  bool _refreshing = false;

  /// Re-read the order from the API.
  ///
  /// Worth offering even seconds after placing it: a vendor can accept in that
  /// time, and a card payment that was still settling may now show as paid.
  Future<void> _refresh() async {
    setState(() => _refreshing = true);
    try {
      final fresh = await ref
          .read(orderRepositoryProvider)
          .fetchOrder(_order.id);
      if (mounted) setState(() => _order = fresh);
    } catch (_) {
      // Nothing on this screen is lost by a failed refresh — the order is
      // placed either way, so a red banner here would only worry someone.
    } finally {
      if (mounted) setState(() => _refreshing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final order = _order;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Order placed'),
        // No back button: the checkout form this came from is gone, and going
        // back to the basket would be going back to nothing.
        automaticallyImplyLeading: false,
        actions: [
          IconButton(
            onPressed: _refreshing ? null : _refresh,
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
            children: [
              Center(
                child: Column(
                  children: [
                    const Text('🎉', style: TextStyle(fontSize: 52)),
                    const SizedBox(height: 12),
                    Text(
                      'Thanks — ${order.storeName} has your order',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Order #${order.reference}',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 28),
              _DeliveryCodeCard(order: order),

              const SizedBox(height: 20),
              _TotalsCard(order: order),

              const SizedBox(height: 20),
              _AddressCard(order: order),

              const SizedBox(height: 28),
              FilledButton.tonal(
                onPressed: () =>
                    // Everything between here and the kitchen list is either
                    // gone or stale, so the stack is cleared rather than popped.
                    Navigator.of(context).popUntil((route) => route.isFirst),
                child: const Text('Back to kitchens'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The code the customer reads out at the door.
class _DeliveryCodeCard extends StatelessWidget {
  const _DeliveryCodeCard({required this.order});

  final CustomerOrder order;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final code = order.deliveryCode;

    if (order.deliveryVerified) {
      return _Card(
        icon: Icons.verified_rounded,
        iconColor: AppColors.leaf,
        title: 'Delivered',
        child: Text(
          'Your code has been used. Enjoy your food.',
          style: theme.textTheme.bodyMedium,
        ),
      );
    }

    if (code == null || code.isEmpty) {
      // Orders placed before delivery codes existed have none. Saying so is
      // better than showing an empty box the customer will stare at.
      return _Card(
        icon: Icons.lock_open_rounded,
        title: 'No delivery code',
        child: Text(
          'This order does not use a delivery code.',
          style: theme.textTheme.bodyMedium,
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [scheme.primary, AppColors.clay],
        ),
        borderRadius: BorderRadius.circular(AppTheme.radius),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.key_rounded, size: 18, color: scheme.onPrimary),
              const SizedBox(width: 8),
              Text(
                'YOUR DELIVERY CODE',
                style: theme.textTheme.labelMedium?.copyWith(
                  color: scheme.onPrimary,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.2,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            // Spaced out so it can be read aloud a digit at a time.
            code.split('').join(' '),
            style: theme.textTheme.displaySmall?.copyWith(
              color: scheme.onPrimary,
              fontWeight: FontWeight.w900,
              letterSpacing: 2,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'Give this to your driver only when your food is in your hands. '
            'They cannot see it, and they cannot close the order without it.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall?.copyWith(
              color: scheme.onPrimary.withValues(alpha: 0.9),
            ),
          ),
        ],
      ),
    );
  }
}

class _TotalsCard extends StatelessWidget {
  const _TotalsCard({required this.order});

  final CustomerOrder order;

  @override
  Widget build(BuildContext context) {
    return _Card(
      icon: Icons.receipt_long_rounded,
      title: 'What you owe',
      child: Column(
        children: [
          _Row(label: 'Items', value: formatRands(order.subtotal)),
          const SizedBox(height: 6),
          _Row(label: 'Delivery', value: formatRands(order.deliveryFee)),
          const Divider(height: 22),
          _Row(
            label: 'Total',
            value: formatRands(order.total),
            emphasis: true,
          ),
          const SizedBox(height: 14),
          _PaymentStatusChip(order: order),
        ],
      ),
    );
  }
}

/// Whether this order is paid for, and what the customer should do about it.
class _PaymentStatusChip extends StatelessWidget {
  const _PaymentStatusChip({required this.order});

  final CustomerOrder order;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final (IconData icon, Color colour, String message) = switch (order) {
      _ when order.isPaid => (
        Icons.check_circle_rounded,
        AppColors.leaf,
        'Paid · ${order.paymentMethod.label}',
      ),
      _ when order.paymentMethod == PaymentMethod.cash => (
        Icons.payments_rounded,
        theme.colorScheme.onSurfaceVariant,
        'Pay ${formatRands(order.total)} in cash when your food arrives',
      ),
      _ when order.paymentStatus == 'failed' => (
        Icons.error_outline_rounded,
        AppColors.chilli,
        'Payment failed — the kitchen is waiting for payment',
      ),
      _ => (
        Icons.schedule_rounded,
        AppColors.maize,
        'Payment not confirmed yet',
      ),
    };

    return Row(
      children: [
        Icon(icon, size: 18, color: colour),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            message,
            style: theme.textTheme.bodySmall?.copyWith(
              color: colour,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    );
  }
}

class _AddressCard extends StatelessWidget {
  const _AddressCard({required this.order});

  final CustomerOrder order;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final instructions = order.address.instructions;

    return _Card(
      icon: Icons.place_outlined,
      title: 'Delivering to',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(order.address.oneLine, style: theme.textTheme.bodyMedium),
          if (instructions != null && instructions.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              instructions,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({
    required this.icon,
    required this.title,
    required this.child,
    this.iconColor,
  });

  final IconData icon;
  final String title;
  final Widget child;
  final Color? iconColor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  icon,
                  size: 18,
                  color: iconColor ?? theme.colorScheme.primary,
                ),
                const SizedBox(width: 8),
                Text(
                  title,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            child,
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
    this.emphasis = false,
  });

  final String label;
  final String value;
  final bool emphasis;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final style = emphasis
        ? theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)
        : theme.textTheme.bodyMedium;

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [Text(label, style: style), Text(value, style: style)],
    );
  }
}
