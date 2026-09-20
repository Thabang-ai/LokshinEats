/// Checkout: where the order is placed.
///
/// The form collects an address, a phone number and a payment method. It does
/// not collect, compute or send a price. That is the whole point of this
/// screen's shape: the old web checkout assembled the order document itself —
/// totals, payouts, payment status and all — and whatever it wrote was what
/// the kitchen got paid. Here the app sends a basket and the server answers
/// with what is owed.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/network/api_exception.dart';
import 'package:lokshineats_core/theme/app_theme.dart';
import 'package:lokshineats_core/utils/money.dart';
import 'package:lokshineats_core/widgets/async_states.dart';
import '../../auth/pages/account_page.dart';
import 'package:lokshineats_core/auth/user_profile.dart';
import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/auth/auth_form_fields.dart';
import '../../cart/models/cart.dart';
import '../../cart/providers/cart_providers.dart';
import '../../stores/providers/store_providers.dart';
import '../models/order.dart';
import '../providers/checkout_providers.dart';
import 'order_confirmation_page.dart';

class CheckoutPage extends ConsumerStatefulWidget {
  const CheckoutPage({super.key});

  @override
  ConsumerState<CheckoutPage> createState() => _CheckoutPageState();
}

class _CheckoutPageState extends ConsumerState<CheckoutPage> {
  final _formKey = GlobalKey<FormState>();
  final _street = TextEditingController();
  final _city = TextEditingController();
  final _postalCode = TextEditingController();
  final _addressNote = TextEditingController();
  final _phone = TextEditingController();
  final _cashAmount = TextEditingController();

  PaymentMethod _method = PaymentMethod.cash;

  /// Set once the profile has landed, so a late-arriving prefill never
  /// overwrites what someone has already typed.
  bool _prefilled = false;

  @override
  void initState() {
    super.initState();
    // The profile is usually already cached by the time checkout opens, and a
    // listener alone would never fire for a value that did not change.
    _prefill(ref.read(profileProvider).value);
  }

  @override
  void dispose() {
    _street.dispose();
    _city.dispose();
    _postalCode.dispose();
    _addressNote.dispose();
    _phone.dispose();
    _cashAmount.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cart = ref.watch(cartProvider);
    final profile = ref.watch(profileProvider);
    final checkout = ref.watch(checkoutControllerProvider);

    // Both listeners fire outside the build phase, which is what makes it safe
    // for them to touch controllers and the navigator.
    ref.listen(profileProvider, (_, next) => _prefill(next.value));
    ref.listen(checkoutControllerProvider, (_, next) => _onCheckoutState(next));

    // Placing an order empties the basket, so an empty basket mid-checkout
    // means the order went through and this screen is on its way out. Showing
    // "your basket is empty" in that moment would be alarming and wrong.
    final finishing = checkout is! CheckoutIdle && checkout is! CheckoutFailed;

    return Scaffold(
      appBar: AppBar(title: const Text('Checkout')),
      body: SafeArea(
        child: switch (profile) {
          AsyncError(:final error) => ErrorState(
            error: error,
            onRetry: () => ref.invalidate(profileProvider),
          ),
          AsyncData(value: null) => const _ProfileIncomplete(),
          AsyncData() when cart.isEmpty && !finishing => const EmptyState(
            title: 'Your basket is empty',
            subtitle: 'Add something to order before checking out.',
            emoji: '🧺',
          ),
          AsyncData() => _Form(
            formKey: _formKey,
            cart: cart,
            street: _street,
            city: _city,
            postalCode: _postalCode,
            addressNote: _addressNote,
            phone: _phone,
            cashAmount: _cashAmount,
            method: _method,
            onMethodChanged: (value) => setState(() => _method = value),
            state: checkout,
            onSubmit: _submit,
            onRetryPayment: () =>
                ref.read(checkoutControllerProvider.notifier).retryPayment(),
          ),
          _ => const Center(child: CircularProgressIndicator()),
        },
      ),
    );
  }

  /// Fill what the app already knows, once.
  void _prefill(UserProfile? profile) {
    if (_prefilled || profile == null) return;
    _prefilled = true;

    final phone = profile.phone;
    if (phone != null && phone.isNotEmpty && _phone.text.isEmpty) {
      _phone.text = phone;
    }

    // The profile stores the same {street, city, postalCode} shape checkout
    // sends, so each part lands in its own field. Only blank fields are
    // filled, so nothing the customer already typed is overwritten.
    final address = profile.address;
    if (address != null) {
      if (_street.text.isEmpty) _street.text = address.street;
      if (_city.text.isEmpty) _city.text = address.city;
      if (_postalCode.text.isEmpty) _postalCode.text = address.postalCode;
    }
  }

  void _onCheckoutState(CheckoutState state) {
    if (state is! CheckoutDone || !mounted) return;

    // Replaced rather than pushed: the order exists now, and going "back" to a
    // checkout form already filled in for it would invite a duplicate.
    Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(
        builder: (_) => OrderConfirmationPage(order: state.order),
      ),
    );
    ref.read(checkoutControllerProvider.notifier).reset();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    // Dismiss the keyboard so the result is visible without scrolling.
    FocusScope.of(context).unfocus();

    await ref
        .read(checkoutControllerProvider.notifier)
        .submit(
          address: DeliveryAddress(
            street: _street.text,
            city: _city.text,
            postalCode: _postalCode.text,
            instructions: _addressNote.text,
          ),
          paymentMethod: _method,
          customerPhone: _phone.text,
          cashAmount: double.tryParse(_cashAmount.text.replaceAll(',', '.')),
        );
  }
}

class _Form extends ConsumerWidget {
  const _Form({
    required this.formKey,
    required this.cart,
    required this.street,
    required this.city,
    required this.postalCode,
    required this.addressNote,
    required this.phone,
    required this.cashAmount,
    required this.method,
    required this.onMethodChanged,
    required this.state,
    required this.onSubmit,
    required this.onRetryPayment,
  });

  final GlobalKey<FormState> formKey;
  final Cart cart;
  final TextEditingController street;
  final TextEditingController city;
  final TextEditingController postalCode;
  final TextEditingController addressNote;
  final TextEditingController phone;
  final TextEditingController cashAmount;
  final PaymentMethod method;
  final ValueChanged<PaymentMethod> onMethodChanged;
  final CheckoutState state;
  final Future<void> Function() onSubmit;
  final Future<void> Function() onRetryPayment;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final busy = state is CheckoutPlacing || state is CheckoutPaying;

    final storeId = cart.storeId;
    final store = storeId == null
        ? null
        : ref.watch(storeProvider(storeId)).value;

    final estimate = store == null
        ? cart.subtotal
        : cart.subtotal + store.deliveryFee;

    return Stack(
      children: [
        Form(
          key: formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
            children: [
              // `case` rather than `is`: `state` is a field, and only a
              // pattern match binds the subtype's own data here.
              if (state case CheckoutFailed(:final error))
                _Problem(message: describeApiError(error)),

              if (state case CheckoutPaymentFailed(:final message)) ...[
                _Problem(message: message, severe: false),
                FilledButton.tonalIcon(
                  onPressed: busy ? null : () => onRetryPayment(),
                  icon: const Icon(Icons.refresh_rounded),
                  label: const Text('Try paying again'),
                ),
                const SizedBox(height: 20),
              ],

              const _SectionHeading(
                icon: Icons.receipt_long_rounded,
                label: 'Your order',
              ),
              _OrderSummaryCard(cart: cart, estimate: estimate),

              const SizedBox(height: 24),
              const _SectionHeading(
                icon: Icons.place_outlined,
                label: 'Where to deliver',
              ),
              TextFormField(
                controller: street,
                textCapitalization: TextCapitalization.words,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.streetAddressLine1],
                // Matches the API's own minimum, so a too-short address fails
                // here rather than after a round trip.
                validator: (value) => (value?.trim().length ?? 0) < 3
                    ? 'Enter your street address.'
                    : null,
                decoration: const InputDecoration(
                  labelText: 'Street address',
                  hintText: '1234 Vilakazi Street',
                  prefixIcon: Icon(Icons.home_outlined),
                ),
              ),
              const SizedBox(height: 14),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    flex: 3,
                    child: TextFormField(
                      controller: city,
                      textCapitalization: TextCapitalization.words,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.addressCity],
                      validator: (value) => (value?.trim().length ?? 0) < 2
                          ? 'Enter your town or city.'
                          : null,
                      decoration: const InputDecoration(
                        labelText: 'Town or city',
                        hintText: 'Soweto',
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: TextFormField(
                      controller: postalCode,
                      keyboardType: TextInputType.number,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.postalCode],
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(4),
                      ],
                      validator: (value) =>
                          RegExp(r'^\d{4}$').hasMatch(value?.trim() ?? '')
                          ? null
                          : 'Four digits.',
                      decoration: const InputDecoration(
                        labelText: 'Postal code',
                        hintText: '1804',
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: addressNote,
                maxLength: 300,
                minLines: 1,
                maxLines: 3,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'Directions for the driver (optional)',
                  hintText: 'Blue gate, ask for Thandi',
                  prefixIcon: Icon(Icons.signpost_outlined),
                  counterText: '',
                ),
              ),
              const SizedBox(height: 10),
              PhoneField(controller: phone),

              const SizedBox(height: 24),
              const _SectionHeading(
                icon: Icons.payments_outlined,
                label: 'How you will pay',
              ),
              for (final option in PaymentMethod.values)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _PaymentOption(
                    option: option,
                    selected: option == method,
                    onSelected: busy ? null : () => onMethodChanged(option),
                  ),
                ),

              if (method == PaymentMethod.cash) ...[
                const SizedBox(height: 6),
                TextFormField(
                  controller: cashAmount,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]')),
                    LengthLimitingTextInputFormatter(7),
                  ],
                  validator: (value) {
                    final raw = (value ?? '').trim();
                    if (raw.isEmpty) return null;

                    final amount = double.tryParse(raw.replaceAll(',', '.'));
                    if (amount == null) return 'Enter an amount, like 200.';
                    // A note smaller than the bill means the driver cannot be
                    // paid. The API rejects it against the real total; this
                    // catches the obvious case before the round trip.
                    if (amount < estimate) {
                      return 'That is less than your order costs.';
                    }
                    return null;
                  },
                  decoration: const InputDecoration(
                    labelText: 'Paying with (optional)',
                    hintText: '200',
                    prefixText: 'R ',
                    prefixIcon: Icon(Icons.wallet_outlined),
                    helperText: 'So your driver brings the right change.',
                    helperMaxLines: 2,
                  ),
                ),
              ],

              const SizedBox(height: 28),
              FilledButton(
                onPressed: busy ? null : () => onSubmit(),
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  textStyle: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                child: Text(
                  method == PaymentMethod.cash
                      ? 'Place order'
                      : 'Place order and pay',
                ),
              ),
            ],
          ),
        ),

        // A blocking overlay while the order is in flight. Tapping "place
        // order" twice would be two orders, and a disabled button alone is
        // easy to miss on a slow connection.
        if (busy)
          Positioned.fill(
            child: ColoredBox(
              color: theme.colorScheme.scrim.withValues(alpha: 0.35),
              child: Center(
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 28,
                      vertical: 24,
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const CircularProgressIndicator(),
                        const SizedBox(height: 16),
                        Text(
                          state is CheckoutPaying
                              ? 'Taking payment…'
                              : 'Sending your order…',
                          style: theme.textTheme.bodyMedium,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _OrderSummaryCard extends StatelessWidget {
  const _OrderSummaryCard({required this.cart, required this.estimate});

  final Cart cart;
  final double estimate;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              cart.storeName,
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 10),
            for (final line in cart.lines)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${line.quantity} × ${line.name}',
                        style: theme.textTheme.bodyMedium,
                      ),
                    ),
                    Text(
                      formatRands(line.lineTotal),
                      style: theme.textTheme.bodyMedium,
                    ),
                  ],
                ),
              ),
            const Divider(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Estimated total', style: theme.textTheme.titleSmall),
                Text(
                  formatRands(estimate),
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              'The kitchen prices your order when you place it, so the amount '
              'you pay is confirmed on the next screen.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A payment method as a tappable card.
///
/// Written by hand rather than with [RadioListTile] so each option can carry
/// its own icon and description at a comfortable tap target — and so the
/// selected state reads clearly in both colour schemes.
class _PaymentOption extends StatelessWidget {
  const _PaymentOption({
    required this.option,
    required this.selected,
    required this.onSelected,
  });

  final PaymentMethod option;
  final bool selected;
  final VoidCallback? onSelected;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Semantics(
      selected: selected,
      button: true,
      child: InkWell(
        onTap: onSelected,
        borderRadius: BorderRadius.circular(AppTheme.radius),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          decoration: BoxDecoration(
            color: selected ? scheme.primaryContainer : scheme.surface,
            borderRadius: BorderRadius.circular(AppTheme.radius),
            border: Border.all(
              color: selected ? scheme.primary : scheme.outlineVariant,
              width: selected ? 2 : 1,
            ),
          ),
          child: Row(
            children: [
              Icon(switch (option) {
                PaymentMethod.cash => Icons.payments_rounded,
                PaymentMethod.yoco => Icons.credit_card_rounded,
                PaymentMethod.ozow => Icons.account_balance_rounded,
              }, color: selected ? scheme.primary : scheme.onSurfaceVariant),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      option.label,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      option.description,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: scheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                selected
                    ? Icons.radio_button_checked_rounded
                    : Icons.radio_button_unchecked_rounded,
                size: 20,
                color: selected ? scheme.primary : scheme.outline,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The API writes its messages for customers, so they are shown as-is.
/// Anything that is not an [ApiException] is a bug, and gets a generic line
/// rather than leaking internals into the UI.
String describeApiError(Object error) {
  if (error is ApiException) {
    return error.firstFieldError ?? error.message;
  }
  return 'Something went wrong placing your order. Please try again.';
}

class _Problem extends StatelessWidget {
  const _Problem({required this.message, this.severe = true});

  final String message;
  final bool severe;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final background = severe
        ? scheme.errorContainer
        : scheme.tertiaryContainer;
    final foreground = severe
        ? scheme.onErrorContainer
        : scheme.onTertiaryContainer;

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(AppTheme.radius),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.error_outline_rounded, size: 20, color: foreground),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: foreground),
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionHeading extends StatelessWidget {
  const _SectionHeading({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Icon(icon, size: 18, color: theme.colorScheme.primary),
          const SizedBox(width: 8),
          Text(
            label,
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

/// Signed in to Firebase, but the API has no profile for this account.
///
/// The order endpoint authorises against the `users/{uid}` record, so there is
/// nothing useful to try from here — finishing the profile is the fix.
class _ProfileIncomplete extends StatelessWidget {
  const _ProfileIncomplete();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Text('📝', style: TextStyle(fontSize: 48)),
          const SizedBox(height: 16),
          Text(
            'Finish setting up your account',
            textAlign: TextAlign.center,
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'We need your name and number before a driver can deliver to you.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => const AccountPage()),
            ),
            child: const Text('Go to your account'),
          ),
        ],
      ),
    );
  }
}
