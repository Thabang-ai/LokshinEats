/// Who is signed in, and the way out.
///
/// Deliberately thin for now: a driver's account details are the same profile
/// the customer app edits, and the screens that matter in this app are the
/// ones with deliveries on them.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/widgets/async_states.dart';

class DriverAccountPage extends ConsumerWidget {
  const DriverAccountPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final profile = ref.watch(profileProvider);

    return profile.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => ErrorState(
        error: error,
        onRetry: () => ref.invalidate(profileProvider),
      ),
      data: (me) => ListView(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
        children: [
          Text(
            me?.displayName.isNotEmpty == true ? me!.displayName : 'Driver',
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w800,
            ),
          ),
          if (me?.phone != null && me!.phone!.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              me.phone!,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
          const SizedBox(height: 28),
          OutlinedButton.icon(
            onPressed: () => ref.read(authControllerProvider.notifier).signOut(),
            icon: const Icon(Icons.logout_rounded),
            label: const Text('Sign out'),
          ),
        ],
      ),
    );
  }
}
