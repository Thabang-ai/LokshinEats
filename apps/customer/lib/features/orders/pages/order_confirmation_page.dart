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

import '../models/order.dart';
import '../providers/checkout_providers.dart';
import '../widgets/order_sections.dart';
import 'order_tracking_page.dart';

class OrderConfirmationPage extends ConsumerStatefulWidget {
  const OrderConfirmationPage({super.key, required this.order});

  /// The order as the server returned it at the end of checkout.
  final CustomerOrder order;

  @override
  ConsumerState<OrderConfirmationPage> createState() =>
      _OrderConfirmationPageState();
}

class _OrderConfirmationPageState extends ConsumerState<OrderConfirmationPage> {
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
              DeliveryCodeCard(order: order),

              const SizedBox(height: 20),
              OrderTotalsCard(order: order),

              const SizedBox(height: 20),
              OrderAddressCard(order: order),

              const SizedBox(height: 28),
              // Replaces this screen rather than stacking on it: tracking shows
              // everything the confirmation does, and keeps it current.
              FilledButton.icon(
                onPressed: () => Navigator.of(context).pushReplacement(
                  MaterialPageRoute<void>(
                    builder: (_) => OrderTrackingPage(orderId: order.id),
                  ),
                ),
                icon: const Icon(Icons.delivery_dining_rounded),
                label: const Text('Track your order'),
              ),
              const SizedBox(height: 12),
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
