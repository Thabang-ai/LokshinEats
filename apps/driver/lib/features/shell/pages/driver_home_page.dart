/// The driver's home: available work, their own deliveries, their account.
///
/// Signing in is not a screen you visit here, it is the gate: until the API
/// knows who is asking it will not say what is available, so there is nothing
/// to show behind it.
///
/// A driver who signs in and has no profile yet — sign-up interrupted between
/// Firebase creating the account and the API creating the profile — is asked
/// to finish it rather than dropped into an app whose every call would 404.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/auth/auth_form_fields.dart';
import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/auth/sign_in_page.dart';

import '../../account/pages/driver_account_page.dart';
import '../../orders/pages/available_deliveries_page.dart';
import '../../orders/pages/my_deliveries_page.dart';

class DriverHomePage extends ConsumerStatefulWidget {
  const DriverHomePage({super.key});

  @override
  ConsumerState<DriverHomePage> createState() => _DriverHomePageState();
}

class _DriverHomePageState extends ConsumerState<DriverHomePage> {
  int _tab = 0;

  static const _titles = ['Available', 'My deliveries', 'Account'];

  @override
  Widget build(BuildContext context) {
    final signedIn = ref.watch(isSignedInProvider);
    if (!signedIn) return const SignInPage();

    if (ref.watch(needsProfileProvider)) return const _FinishSignUp();

    return Scaffold(
      appBar: AppBar(title: Text(_titles[_tab])),
      body: SafeArea(
        child: IndexedStack(
          index: _tab,
          children: const [
            AvailableDeliveriesPage(),
            MyDeliveriesPage(),
            DriverAccountPage(),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (index) => setState(() => _tab = index),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.explore_outlined),
            selectedIcon: Icon(Icons.explore),
            label: 'Available',
          ),
          NavigationDestination(
            icon: Icon(Icons.local_shipping_outlined),
            selectedIcon: Icon(Icons.local_shipping),
            label: 'Mine',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Account',
          ),
        ],
      ),
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
              'Your account exists but your driver profile does not. Kitchens '
              'and customers need a name and a number to reach you on.',
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
