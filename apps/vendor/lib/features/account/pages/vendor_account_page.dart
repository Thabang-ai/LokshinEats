/// The kitchen's own details, and the way out.
///
/// Thin for now: editing the storefront and the menu are their own screens,
/// not yet built. What is here is what a vendor needs to check at a glance —
/// that customers are seeing the right kitchen, and what an order pays.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/theme/app_theme.dart';
import 'package:lokshineats_core/utils/money.dart';

import '../../store/providers/store_providers.dart';

class VendorAccountPage extends ConsumerWidget {
  const VendorAccountPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final status = StatusColors.of(context);
    final store = ref.watch(myStoreProvider).value;

    if (store == null) return const SizedBox.shrink();

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
      children: [
        Text(
          store.name,
          style: theme.textTheme.headlineSmall?.copyWith(
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          store.cuisine,
          style: theme.textTheme.bodyMedium?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 16),
        Text(
          store.isOpen
              ? 'Open — customers can order from you.'
              : 'Closed — you are not taking new orders.',
          style: theme.textTheme.bodyMedium?.copyWith(
            color: store.isOpen ? status.success : status.danger,
            fontWeight: FontWeight.w700,
          ),
        ),

        const SizedBox(height: 24),
        _Row(label: 'Where you are', value: '${store.address}, ${store.city}'),
        if (store.phone != null) _Row(label: 'Phone', value: store.phone!),
        _Row(label: 'Delivery fee', value: formatRands(store.deliveryFee)),
        _Row(label: 'Minimum order', value: formatRands(store.minOrderAmount)),
        _Row(label: 'Delivery time', value: store.deliveryTime),

        const SizedBox(height: 28),
        OutlinedButton.icon(
          onPressed: () => ref.read(authControllerProvider.notifier).signOut(),
          icon: const Icon(Icons.logout_rounded),
          label: const Text('Sign out'),
        ),
      ],
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 140,
            child: Text(
              label,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
