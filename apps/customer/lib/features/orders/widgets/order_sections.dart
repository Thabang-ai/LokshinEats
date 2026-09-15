/// The building blocks of an order screen.
///
/// Shared by the confirmation screen and the tracking screen so an order reads
/// the same wherever the customer meets it — above all the delivery code,
/// which has to look identical the second time they go looking for it at the
/// door.
library;

import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/money.dart';
import '../models/order.dart';

/// The code the customer reads out at the door.
///
/// It lives in `orderSecrets/{orderId}`, a collection no client rule matches,
/// and the API serves it to this order's own customer and to admins — never to
/// the driver. The driver types it in; the server compares. That is what makes
/// "delivered" mean the customer was there.
class DeliveryCodeCard extends StatelessWidget {
  const DeliveryCodeCard({super.key, required this.order});

  final CustomerOrder order;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final code = order.deliveryCode;

    if (order.deliveryVerified || order.status == OrderStatus.delivered) {
      return SectionCard(
        icon: Icons.verified_rounded,
        iconColor: StatusColors.of(context).success,
        title: 'Delivered',
        child: Text(
          'Your code has been used. Enjoy your food.',
          style: theme.textTheme.bodyMedium,
        ),
      );
    }

    if (order.status == OrderStatus.cancelled) {
      // A code for an order that will never arrive is only confusing.
      return const SizedBox.shrink();
    }

    if (code == null || code.isEmpty) {
      // Orders placed before delivery codes existed have none. Saying so is
      // better than showing an empty box the customer will stare at.
      return SectionCard(
        icon: Icons.lock_open_rounded,
        title: 'No delivery code',
        child: Text(
          'This order does not use a delivery code.',
          style: theme.textTheme.bodyMedium,
        ),
      );
    }

    return Semantics(
      // Read as separate digits, not as a six-figure number.
      label: 'Your delivery code is ${code.split('').join(' ')}',
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [scheme.primary, AppColors.clay],
          ),
          borderRadius: BorderRadius.circular(AppTheme.radius),
        ),
        child: ExcludeSemantics(
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
                'Give this to your driver only when your food is in your '
                'hands. They cannot see it, and they cannot close the order '
                'without it.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: scheme.onPrimary.withValues(alpha: 0.9),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// What was ordered, at the prices it was placed at.
class OrderItemsCard extends StatelessWidget {
  const OrderItemsCard({super.key, required this.order});

  final CustomerOrder order;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SectionCard(
      icon: Icons.restaurant_menu_rounded,
      title: order.storeName.isEmpty ? 'Your order' : order.storeName,
      child: order.items.isEmpty
          ? Text(
              'No items were recorded on this order.',
              style: theme.textTheme.bodyMedium,
            )
          : Column(
              children: [
                for (final line in order.items)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${line.quantity} × ${line.name}',
                                style: theme.textTheme.bodyMedium,
                              ),
                              if (line.specialInstructions != null)
                                Text(
                                  line.specialInstructions!,
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    color: theme.colorScheme.onSurfaceVariant,
                                    fontStyle: FontStyle.italic,
                                  ),
                                ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 12),
                        Text(
                          formatRands(line.lineTotal),
                          style: theme.textTheme.bodyMedium,
                        ),
                      ],
                    ),
                  ),
              ],
            ),
    );
  }
}

/// What the order cost, and whether it is paid for.
class OrderTotalsCard extends StatelessWidget {
  const OrderTotalsCard({super.key, required this.order});

  final CustomerOrder order;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      icon: Icons.receipt_long_rounded,
      title: 'What you owe',
      child: Column(
        children: [
          AmountRow(label: 'Items', value: formatRands(order.subtotal)),
          const SizedBox(height: 6),
          AmountRow(label: 'Delivery', value: formatRands(order.deliveryFee)),
          const Divider(height: 22),
          AmountRow(
            label: 'Total',
            value: formatRands(order.total),
            emphasis: true,
          ),
          const SizedBox(height: 14),
          PaymentStatusRow(order: order),
        ],
      ),
    );
  }
}

/// Whether this order is paid for, and what the customer should do about it.
class PaymentStatusRow extends StatelessWidget {
  const PaymentStatusRow({super.key, required this.order});

  final CustomerOrder order;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = StatusColors.of(context);

    final (IconData icon, Color colour, String message) = switch (order) {
      _ when order.isPaid => (
        Icons.check_circle_rounded,
        status.success,
        'Paid · ${order.paymentMethod.label}',
      ),
      _ when order.paymentStatus == 'refunded' => (
        Icons.account_balance_wallet_rounded,
        status.success,
        'Refunded to your LokshinEats wallet',
      ),
      _ when order.status == OrderStatus.cancelled => (
        Icons.block_rounded,
        theme.colorScheme.onSurfaceVariant,
        'Not charged — this order was cancelled',
      ),
      _ when order.paymentMethod == PaymentMethod.cash => (
        Icons.payments_rounded,
        theme.colorScheme.onSurfaceVariant,
        order.cashAmount != null && order.cashAmount! > order.total
            ? 'Pay ${formatRands(order.total)} in cash — your driver brings '
                  'change from ${formatRands(order.cashAmount!)}'
            : 'Pay ${formatRands(order.total)} in cash when your food arrives',
      ),
      _ when order.paymentStatus == 'failed' => (
        Icons.error_outline_rounded,
        status.danger,
        'Payment failed — the kitchen is waiting for payment',
      ),
      _ => (
        Icons.schedule_rounded,
        status.warning,
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

class OrderAddressCard extends StatelessWidget {
  const OrderAddressCard({super.key, required this.order});

  final CustomerOrder order;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final instructions = order.address.instructions;

    return SectionCard(
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

/// A titled card, the common frame for every section above.
class SectionCard extends StatelessWidget {
  const SectionCard({
    super.key,
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
                Expanded(
                  child: Text(
                    title,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
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

class AmountRow extends StatelessWidget {
  const AmountRow({
    super.key,
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
