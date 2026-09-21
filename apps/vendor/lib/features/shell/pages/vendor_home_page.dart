/// The kitchen's home.
///
/// Three gates before the queue: signed in, has an API profile, has a
/// kitchen. The last one is not a formality — registering the kitchen is what
/// makes the account a vendor, and every call this app makes is refused until
/// it has happened.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/auth/auth_form_fields.dart';
import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/auth/sign_in_page.dart';
import 'package:lokshineats_core/theme/app_theme.dart';
import 'package:lokshineats_core/widgets/async_states.dart';

import '../../account/pages/vendor_account_page.dart';
import '../../earnings/pages/earnings_page.dart';
import '../../menu/pages/menu_page.dart';
import '../../orders/pages/order_queue_page.dart';
import '../../store/pages/register_store_page.dart';
import '../../store/providers/store_providers.dart';

class VendorHomePage extends ConsumerStatefulWidget {
  const VendorHomePage({super.key});

  @override
  ConsumerState<VendorHomePage> createState() => _VendorHomePageState();
}

class _VendorHomePageState extends ConsumerState<VendorHomePage> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    if (!ref.watch(isSignedInProvider)) return const SignInPage();
    if (ref.watch(needsProfileProvider)) return const _FinishSignUp();

    final store = ref.watch(myStoreProvider);

    return store.when(
      loading: () =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (error, _) => Scaffold(
        body: ErrorState(
          error: error,
          onRetry: () => ref.invalidate(myStoreProvider),
        ),
      ),
      // No kitchen yet: registering one is both the setup and the promotion
      // to vendor, so there is nothing else to show.
      data: (mine) => mine == null
          ? const RegisterStorePage()
          : Scaffold(
              appBar: AppBar(
                title: Text(switch (_tab) {
                  0 => mine.name,
                  1 => 'Menu',
                  2 => 'Earnings',
                  _ => 'Kitchen',
                }),
                actions: [if (_tab == 0) const _OpenSwitch()],
              ),
              body: SafeArea(
                child: IndexedStack(
                  index: _tab,
                  children: const [
                    OrderQueuePage(),
                    MenuPage(),
                    EarningsPage(),
                    VendorAccountPage(),
                  ],
                ),
              ),
              bottomNavigationBar: NavigationBar(
                selectedIndex: _tab,
                onDestinationSelected: (index) => setState(() => _tab = index),
                destinations: const [
                  NavigationDestination(
                    icon: Icon(Icons.receipt_long_outlined),
                    selectedIcon: Icon(Icons.receipt_long),
                    label: 'Orders',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.restaurant_menu_outlined),
                    selectedIcon: Icon(Icons.restaurant_menu),
                    label: 'Menu',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.payments_outlined),
                    selectedIcon: Icon(Icons.payments),
                    label: 'Earnings',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.storefront_outlined),
                    selectedIcon: Icon(Icons.storefront),
                    label: 'Kitchen',
                  ),
                ],
              ),
            ),
    );
  }
}

/// Open or closed, where a kitchen can reach it without leaving the queue.
///
/// Closing stops new orders; it does not touch the ones already in the
/// kitchen, which is why it is safe to flip mid-service when things get away
/// from you.
class _OpenSwitch extends ConsumerStatefulWidget {
  const _OpenSwitch();

  @override
  ConsumerState<_OpenSwitch> createState() => _OpenSwitchState();
}

class _OpenSwitchState extends ConsumerState<_OpenSwitch> {
  bool _busy = false;

  Future<void> _toggle(bool value) async {
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);

    try {
      await ref.read(myStoreProvider.notifier).setOpen(value);
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            value
                ? 'Open. Customers can order from you again.'
                : 'Closed. No new orders will come in.',
          ),
        ),
      );
    } catch (error) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Could not change that. Try again.')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final store = ref.watch(myStoreProvider).value;
    if (store == null) return const SizedBox.shrink();

    final status = StatusColors.of(context);

    return Row(
      children: [
        Text(
          store.isOpen ? 'Open' : 'Closed',
          style: Theme.of(context).textTheme.labelLarge?.copyWith(
            fontWeight: FontWeight.w700,
            color: store.isOpen ? status.success : status.danger,
          ),
        ),
        Switch(value: store.isOpen, onChanged: _busy ? null : _toggle),
        const SizedBox(width: 4),
      ],
    );
  }
}

/// Firebase has the account, the API has no profile for it yet.
class _FinishSignUp extends ConsumerStatefulWidget {
  const _FinishSignUp();

  @override
  ConsumerState<_FinishSignUp> createState() => _FinishSignUpState();
}

class _FinishSignUpState extends ConsumerState<_FinishSignUp> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    await ref
        .read(authControllerProvider.notifier)
        .completeProfile(displayName: _name.text, phone: _phone.text);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final busy = ref.watch(authControllerProvider).isLoading;

    return Scaffold(
      appBar: AppBar(title: const Text('Finish signing up')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
          children: [
            Text(
              'Almost there',
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Your account exists but your profile does not. Drivers and '
              'LokshinEats need a name and a number for you.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 24),
            Form(
              key: _formKey,
              child: Column(
                children: [
                  NameField(controller: _name),
                  const SizedBox(height: 14),
                  PhoneField(controller: _phone),
                ],
              ),
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: busy ? null : _submit,
              child: busy
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Finish'),
            ),
            const SizedBox(height: 12),
            TextButton(
              onPressed: busy
                  ? null
                  : () => ref.read(authControllerProvider.notifier).signOut(),
              child: const Text('Sign out'),
            ),
          ],
        ),
      ),
    );
  }
}
