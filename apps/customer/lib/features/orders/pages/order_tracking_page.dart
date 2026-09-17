/// One order, kept up to date while the screen is open.
///
/// The top of the screen answers "where is my food"; the delivery code comes
/// straight after, because it is the thing someone opens this screen for when
/// the driver is at the gate.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/async_states.dart';
import '../../wallet/providers/wallet_providers.dart';
import '../models/order.dart';
import '../providers/order_tracking_providers.dart';
import '../widgets/cancel_order_button.dart';
import '../widgets/order_sections.dart';
import 'your_orders_page.dart';

class OrderTrackingPage extends ConsumerWidget {
  const OrderTrackingPage({super.key, required this.orderId});

  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tracking = ref.watch(orderTrackingProvider(orderId));
    final notifier = ref.read(orderTrackingProvider(orderId).notifier);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Your order'),
        actions: [
          IconButton(
            onPressed: tracking.hasValue ? notifier.refresh : null,
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: SafeArea(
        child: tracking.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => ErrorState(
            error: error,
            onRetry: () => ref.invalidate(orderTrackingProvider(orderId)),
          ),
          data: (data) => RefreshIndicator(
            onRefresh: notifier.refresh,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
              children: [
                _StatusHeader(tracking: data),
                const SizedBox(height: 16),
                if (data.order.status == OrderStatus.cancelled)
                  CancellationNotice(order: data.order)
                else
                  _Timeline(status: data.order.status),
                const SizedBox(height: 16),
                DeliveryCodeCard(order: data.order),
                const SizedBox(height: 16),
                OrderItemsCard(order: data.order),
                const SizedBox(height: 16),
                OrderTotalsCard(order: data.order),
                const SizedBox(height: 16),
                OrderAddressCard(order: data.order),
                if (data.order.status.isActive) ...[
                  const SizedBox(height: 28),
                  CancelOrderButton(
                    order: data.order,
                    // Called when the order was cancelled, or turned out to
                    // have moved on: either way the screen, the order list
                    // and the wallet balance may all be out of date.
                    onOrderChanged: () {
                      notifier.refresh();
                      ref.invalidate(myOrdersProvider);
                      ref.invalidate(walletProvider);
                    },
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StatusHeader extends StatelessWidget {
  const _StatusHeader({required this.tracking});

  final OrderTracking tracking;

  static final DateFormat _placed = DateFormat('d MMM yyyy, HH:mm');

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final order = tracking.order;
    final created = order.createdAt;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                order.status.label,
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            OrderStatusChip(status: order.status),
          ],
        ),
        const SizedBox(height: 4),
        Text(order.status.description, style: theme.textTheme.bodyLarge),
        const SizedBox(height: 8),
        Text(
          [
            '#${order.reference}',
            if (order.storeName.isNotEmpty) order.storeName,
            if (created != null) _placed.format(created),
          ].join(' · '),
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 6),
        _Freshness(tracking: tracking),
      ],
    );
  }
}

/// Says how current the screen is, and admits it when a refresh failed.
class _Freshness extends StatelessWidget {
  const _Freshness({required this.tracking});

  final OrderTracking tracking;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final active = tracking.order.status.isActive;
    final at = DateFormat('HH:mm').format(tracking.refreshedAt);

    if (tracking.refreshFailed) {
      return Row(
        children: [
          Icon(
            Icons.wifi_off_rounded,
            size: 16,
            color: StatusColors.of(context).danger,
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              'Could not refresh — showing the order as of $at. '
              'Still trying.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: StatusColors.of(context).danger,
              ),
            ),
          ),
        ],
      );
    }

    return Text(
      active
          ? 'Updated $at · refreshes automatically'
          : 'Updated $at',
      style: theme.textTheme.bodySmall?.copyWith(
        color: theme.colorScheme.onSurfaceVariant,
      ),
    );
  }
}

/// Where the order is, as steps.
///
/// Five steps, not the server's six statuses. The vendor dashboard's "Accept
/// Order" goes straight from placed to preparing, so a separate "accepted"
/// step would sit unticked on most orders and look like something was
/// skipped. `confirmed` and `preparing` therefore share the kitchen step.
class _Timeline extends StatelessWidget {
  const _Timeline({required this.status});

  final OrderStatus status;

  static const _steps = [
    ('Order placed', Icons.receipt_long_rounded),
    ('In the kitchen', Icons.soup_kitchen_rounded),
    ('Ready for pickup', Icons.takeout_dining_rounded),
    ('On the way', Icons.delivery_dining_rounded),
    ('Delivered', Icons.check_circle_rounded),
  ];

  int get _currentStep => switch (status) {
    OrderStatus.pending => 0,
    OrderStatus.confirmed || OrderStatus.preparing => 1,
    OrderStatus.ready => 2,
    OrderStatus.pickedUp => 3,
    OrderStatus.delivered => 4,
    // Not reached: cancelled orders show a notice instead of the timeline.
    OrderStatus.cancelled => 0,
  };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final current = _currentStep;
    final finished = status == OrderStatus.delivered;

    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
        child: Column(
          children: [
            for (var i = 0; i < _steps.length; i++)
              Semantics(
                label:
                    '${_steps[i].$1}: '
                    '${i < current || finished ? 'done' : i == current ? 'now' : 'to come'}',
                child: ExcludeSemantics(
                  child: IntrinsicHeight(
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Column(
                          children: [
                            _StepDot(
                              icon: _steps[i].$2,
                              done: i < current || finished,
                              isCurrent: i == current && !finished,
                            ),
                            if (i < _steps.length - 1)
                              Expanded(
                                child: Container(
                                  width: 2,
                                  margin: const EdgeInsets.symmetric(
                                    vertical: 2,
                                  ),
                                  color: i < current
                                      ? scheme.primary
                                      : scheme.outlineVariant,
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Padding(
                            padding: const EdgeInsets.only(top: 6, bottom: 18),
                            child: Text(
                              _steps[i].$1,
                              style: theme.textTheme.bodyLarge?.copyWith(
                                fontWeight: i == current
                                    ? FontWeight.w800
                                    : FontWeight.w500,
                                color: i <= current
                                    ? scheme.onSurface
                                    : scheme.onSurfaceVariant,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _StepDot extends StatelessWidget {
  const _StepDot({
    required this.icon,
    required this.done,
    required this.isCurrent,
  });

  final IconData icon;
  final bool done;
  final bool isCurrent;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final filled = done || isCurrent;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 250),
      width: 32,
      height: 32,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: filled ? scheme.primary : scheme.surfaceContainerHighest,
        border: isCurrent
            ? Border.all(color: scheme.primaryContainer, width: 3)
            : null,
      ),
      child: Icon(
        done ? Icons.check_rounded : icon,
        size: 17,
        color: filled ? scheme.onPrimary : scheme.onSurfaceVariant,
      ),
    );
  }
}
