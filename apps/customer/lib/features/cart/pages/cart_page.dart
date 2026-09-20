/// The basket.
///
/// Shows what the customer has chosen, lets them change it, and hands off to
/// checkout. Every amount on this screen is an estimate and says so: the
/// server prices the order when it is placed, from the kitchen's own records.
/// That is not a caveat to hide — a customer who sees R5 more at checkout
/// because a vendor re-priced a dish deserves to have been told the figure was
/// indicative.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/theme/app_theme.dart';
import 'package:lokshineats_core/utils/money.dart';
import 'package:lokshineats_core/widgets/async_states.dart';
import '../../auth/pages/sign_in_page.dart';
import 'package:lokshineats_core/auth/auth_providers.dart';
import '../../orders/pages/checkout_page.dart';
import '../../stores/models/store.dart';
import '../../stores/providers/store_providers.dart';
import '../models/cart.dart';
import '../providers/cart_providers.dart';
import '../widgets/quantity_stepper.dart';

class CartPage extends ConsumerWidget {
  const CartPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cart = ref.watch(cartProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(cart.isEmpty ? 'Your basket' : cart.storeName),
        actions: [
          if (cart.isNotEmpty)
            TextButton(
              onPressed: () => _confirmClear(context, ref),
              child: const Text('Clear'),
            ),
        ],
      ),
      body: cart.isEmpty
          ? const EmptyState(
              title: 'Your basket is empty',
              subtitle: 'Pick a kitchen and add something you feel like.',
              emoji: '🧺',
            )
          : _CartBody(cart: cart),
    );
  }

  Future<void> _confirmClear(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Empty your basket?'),
        content: const Text('Everything you have chosen will be removed.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Keep it'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Empty'),
          ),
        ],
      ),
    );

    if (confirmed == true) ref.read(cartProvider.notifier).clear();
  }
}

class _CartBody extends ConsumerWidget {
  const _CartBody({required this.cart});

  final Cart cart;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Fetched fresh rather than taken from the basket: the delivery fee and
    // the kitchen's minimum are the vendor's to change, and the figures shown
    // here should be the ones the server will apply.
    final store = ref.watch(storeProvider(cart.storeId!));

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              for (final line in cart.lines)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _CartLineCard(line: line),
                ),
              const SizedBox(height: 8),
              store.when(
                loading: () => const Center(
                  child: Padding(
                    padding: EdgeInsets.all(16),
                    child: ShimmerBox(width: 220, height: 14),
                  ),
                ),
                // A failed store fetch must not hide the basket. The totals
                // are estimates anyway, so the items stay usable and only the
                // summary says it could not load.
                error: (_, _) => const _SummaryUnavailable(),
                data: (data) => _Summary(cart: cart, store: data),
              ),
            ],
          ),
        ),
        store.maybeWhen(
          data: (data) => _CheckoutBar(cart: cart, store: data),
          orElse: () => const SizedBox.shrink(),
        ),
      ],
    );
  }
}

class _CartLineCard extends ConsumerStatefulWidget {
  const _CartLineCard({required this.line});

  final CartLine line;

  @override
  ConsumerState<_CartLineCard> createState() => _CartLineCardState();
}

class _CartLineCardState extends ConsumerState<_CartLineCard> {
  late final TextEditingController _instructions = TextEditingController(
    text: widget.line.specialInstructions ?? '',
  );

  /// Collapsed unless there is already a note, so the common case stays tidy.
  late bool _noteOpen = (widget.line.specialInstructions ?? '').isNotEmpty;

  @override
  void dispose() {
    _instructions.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final line = widget.line;
    final notifier = ref.read(cartProvider.notifier);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        line.name,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${formatPrice(line.unitPrice)} each',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    QuantityStepper(
                      quantity: line.quantity,
                      onChanged: (quantity) =>
                          notifier.setQuantity(line.productId, quantity),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      formatRands(line.lineTotal),
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ],
            ),

            if (_noteOpen) ...[
              const SizedBox(height: 10),
              TextField(
                controller: _instructions,
                maxLength: 300,
                minLines: 1,
                maxLines: 3,
                textCapitalization: TextCapitalization.sentences,
                // Saved as it is typed. A note lost because someone tapped
                // "Checkout" without unfocusing the field would be a silent
                // failure, and the cook never sees it.
                onChanged: (value) =>
                    notifier.setInstructions(line.productId, value),
                decoration: const InputDecoration(
                  labelText: 'Note for the kitchen',
                  hintText: 'No onions, extra chilli…',
                  counterText: '',
                ),
              ),
            ] else
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: () => setState(() => _noteOpen = true),
                  icon: const Icon(Icons.edit_note_rounded, size: 18),
                  label: const Text('Add a note'),
                  style: TextButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    visualDensity: VisualDensity.compact,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({required this.cart, required this.store});

  final Cart cart;
  final Store store;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final short = store.minOrderAmount - cart.subtotal;

    return Column(
      children: [
        _SummaryRow(label: 'Items', value: formatRands(cart.subtotal)),
        const SizedBox(height: 6),
        _SummaryRow(label: 'Delivery', value: formatRands(store.deliveryFee)),
        const Divider(height: 24),
        _SummaryRow(
          label: 'Estimated total',
          value: formatRands(cart.subtotal + store.deliveryFee),
          emphasis: true,
        ),
        const SizedBox(height: 10),
        Text(
          'The kitchen confirms the final price when you place the order.',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),

        if (short > 0) ...[
          const SizedBox(height: 14),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: theme.colorScheme.secondaryContainer,
              borderRadius: BorderRadius.circular(AppTheme.radius),
            ),
            child: Text(
              'Add ${formatRands(short)} more to reach this kitchen’s '
              '${formatRands(store.minOrderAmount)} minimum.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSecondaryContainer,
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _SummaryUnavailable extends StatelessWidget {
  const _SummaryUnavailable();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Text(
        'Could not load this kitchen’s delivery fee. Your items are safe — '
        'try again in a moment.',
        textAlign: TextAlign.center,
        style: theme.textTheme.bodySmall?.copyWith(
          color: theme.colorScheme.onSurfaceVariant,
        ),
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({
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

/// The pinned bar that either blocks checkout, or starts it.
///
/// Three things can stop a customer here — the kitchen is closed, the basket
/// is under the minimum, or they are not signed in — and each gets its own
/// message rather than one disabled button with no explanation.
class _CheckoutBar extends ConsumerWidget {
  const _CheckoutBar({required this.cart, required this.store});

  final Cart cart;
  final Store store;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final signedIn = ref.watch(isSignedInProvider);

    final belowMinimum = cart.subtotal < store.minOrderAmount;
    final blocked = !store.isOpen || belowMinimum;

    final String label;
    if (!store.isOpen) {
      label = 'This kitchen is closed';
    } else if (belowMinimum) {
      label = 'Minimum ${formatRands(store.minOrderAmount)}';
    } else if (!signedIn) {
      label = 'Sign in to checkout';
    } else {
      label = 'Checkout · ${formatRands(cart.subtotal + store.deliveryFee)}';
    }

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: blocked
                ? null
                : () => _continue(context, signedIn: signedIn),
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 16),
              textStyle: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
            child: Text(label),
          ),
        ),
      ),
    );
  }

  /// Signing in is a detour, not a dead end: the basket survives it and the
  /// customer lands back here, so checkout is one tap away afterwards.
  void _continue(BuildContext context, {required bool signedIn}) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => signedIn ? const CheckoutPage() : const SignInPage(),
      ),
    );
  }
}
