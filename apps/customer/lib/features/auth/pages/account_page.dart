/// The customer's account.
///
/// Handles all three states rather than assuming a signed-in customer with a
/// profile: signed out, signed in without a profile (a sign-up that did not
/// finish), and signed in with one.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/widgets/async_states.dart';
import 'package:lokshineats_core/auth/user_profile.dart';
import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/auth/auth_error_banner.dart';
import 'package:lokshineats_core/auth/auth_form_fields.dart';
import '../../orders/pages/your_orders_page.dart';
import '../../wallet/pages/wallet_page.dart';
import 'edit_profile_page.dart';
import 'package:lokshineats_core/auth/sign_in_page.dart';
import 'package:lokshineats_core/auth/sign_up_page.dart';

class AccountPage extends ConsumerWidget {
  const AccountPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final signedIn = ref.watch(isSignedInProvider);
    final profile = ref.watch(profileProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Account')),
      body: SafeArea(
        child: !signedIn
            ? const _SignedOut()
            : profile.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (error, _) => ErrorState(
                  error: error,
                  onRetry: () => ref.invalidate(profileProvider),
                ),
                data: (data) => data == null
                    ? const _CompleteProfile()
                    : _SignedIn(profile: data),
              ),
      ),
    );
  }
}

class _SignedOut extends StatelessWidget {
  const _SignedOut();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Text('🍲', style: TextStyle(fontSize: 52)),
          const SizedBox(height: 16),
          Text(
            'Sign in to order',
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'You can browse kitchens without an account. You will need one to '
            'place an order and track it.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 28),
          FilledButton(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => const SignInPage()),
            ),
            child: const Text('Sign in'),
          ),
          const SizedBox(height: 10),
          TextButton(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => const SignUpPage()),
            ),
            child: const Text('Create an account'),
          ),
        ],
      ),
    );
  }
}

/// Signed in to Firebase, but the API has no profile.
///
/// Reached when sign-up was interrupted between the two calls. Recoverable, so
/// this asks for the missing details rather than showing an error.
class _CompleteProfile extends ConsumerStatefulWidget {
  const _CompleteProfile();

  @override
  ConsumerState<_CompleteProfile> createState() => _CompleteProfileState();
}

class _CompleteProfileState extends ConsumerState<_CompleteProfile> {
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

    await ref.read(authControllerProvider.notifier).completeProfile(
      displayName: _name.text,
      phone: _phone.text,
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final state = ref.watch(authControllerProvider);
    final busy = state.isLoading;

    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(
          'Finish setting up',
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'Your account exists, but we still need a couple of details before '
          'you can order.',
          style: theme.textTheme.bodyMedium?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 22),
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
        if (state.hasError) ...[
          const SizedBox(height: 16),
          AuthErrorBanner(error: state.error!),
        ],
        const SizedBox(height: 20),
        FilledButton(
          onPressed: busy ? null : _submit,
          child: busy
              ? const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Save and continue'),
        ),
        const SizedBox(height: 8),
        TextButton(
          onPressed: busy
              ? null
              : () => ref.read(authControllerProvider.notifier).signOut(),
          child: const Text('Sign out instead'),
        ),
      ],
    );
  }
}

class _SignedIn extends ConsumerWidget {
  const _SignedIn({required this.profile});

  final UserProfile profile;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Row(
          children: [
            CircleAvatar(
              radius: 28,
              backgroundColor: theme.colorScheme.primaryContainer,
              child: Text(
                profile.firstName.characters.first.toUpperCase(),
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: theme.colorScheme.onPrimaryContainer,
                ),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Hi ${profile.firstName}',
                    style: theme.textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  Text(
                    profile.email,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 28),

        _Detail(label: 'Name', value: profile.displayName),
        _Detail(label: 'Mobile', value: profile.phone ?? 'Not set'),
        _Detail(
          label: 'Address',
          value: profile.address?.oneLine ?? 'Not set',
        ),
        const SizedBox(height: 12),
        Align(
          alignment: Alignment.centerLeft,
          child: FilledButton.tonalIcon(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => EditProfilePage(profile: profile),
              ),
            ),
            icon: const Icon(Icons.edit_rounded),
            label: const Text('Edit profile'),
          ),
        ),

        const SizedBox(height: 20),
        Card(
          child: ListTile(
            leading: const Icon(Icons.receipt_long_rounded),
            title: const Text('Your orders'),
            subtitle: const Text('Track an order or find a delivery code'),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => const YourOrdersPage()),
            ),
          ),
        ),
        Card(
          child: ListTile(
            leading: const Icon(Icons.account_balance_wallet_rounded),
            title: const Text('Wallet'),
            subtitle: const Text('Refunds and credits'),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => const WalletPage()),
            ),
          ),
        ),

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

class _Detail extends StatelessWidget {
  const _Detail({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 90,
            child: Text(
              label,
              style: theme.textTheme.bodySmall?.copyWith(
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
