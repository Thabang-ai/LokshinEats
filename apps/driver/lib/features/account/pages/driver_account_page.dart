/// The driver's own page: who we have them down as, and what we let them
/// deliver on.
///
/// It used to be a name and a Sign out button, which told a driver nothing
/// they did not already know. The two questions a driver actually has about
/// their account are "do you have my right number" and "where is my
/// application", and both are answered here rather than in a queue on a phone
/// call.
///
/// The vehicle details are shown exactly as the API holds them, including
/// which of them are still being checked, because they are what decides which
/// deliveries this driver is offered.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/auth/edit_profile_page.dart';
import 'package:lokshineats_core/auth/user_profile.dart';
import 'package:lokshineats_core/theme/app_theme.dart';
import 'package:lokshineats_core/widgets/async_states.dart';

import '../../verification/models/driver_verification.dart';
import '../../verification/pages/verification_page.dart';
import '../../verification/providers/verification_providers.dart';

class DriverAccountPage extends ConsumerWidget {
  const DriverAccountPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(profileProvider);

    return profile.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => ErrorState(
        error: error,
        onRetry: () => ref.invalidate(profileProvider),
      ),
      data: (me) => RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(profileProvider);
          await ref.read(verificationProvider.notifier).refresh();
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
          children: [
            _Header(profile: me),
            const SizedBox(height: 24),

            _Detail(
              label: 'Name',
              value: me?.displayName.isNotEmpty == true
                  ? me!.displayName
                  : 'Not set',
            ),
            // A number saved as an empty string is no number at all, and
            // kitchens phone this one.
            _Detail(
              label: 'Mobile',
              value: me?.phone?.trim().isNotEmpty == true
                  ? me!.phone!
                  : 'Not set',
            ),
            const SizedBox(height: 4),
            if (me != null)
              Align(
                alignment: Alignment.centerLeft,
                child: FilledButton.tonalIcon(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      // A driver's home address is nobody's business: kitchens
                      // and customers need a number to call, not a house.
                      builder: (_) =>
                          EditProfilePage(profile: me, showAddress: false),
                    ),
                  ),
                  icon: const Icon(Icons.edit_rounded),
                  label: const Text('Edit your details'),
                ),
              ),

            const SizedBox(height: 28),
            const _VehicleCard(),

            const SizedBox(height: 28),
            OutlinedButton.icon(
              onPressed: () =>
                  ref.read(authControllerProvider.notifier).signOut(),
              icon: const Icon(Icons.logout_rounded),
              label: const Text('Sign out'),
            ),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.profile});

  final UserProfile? profile;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final name = profile?.displayName.trim() ?? '';
    final initial = name.isEmpty ? 'D' : name.characters.first.toUpperCase();

    return Row(
      children: [
        CircleAvatar(
          radius: 28,
          backgroundColor: theme.colorScheme.primaryContainer,
          child: Text(
            initial,
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
                name.isEmpty ? 'Driver' : name,
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              if (profile?.email.isNotEmpty == true)
                Text(
                  profile!.email,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

/// What this driver delivers on, and where that stands.
///
/// Reached from here as well as from the gate, because an approved driver
/// still needs somewhere to correct a registration number or say they have
/// changed vehicle — and changing it is not a small thing, so the card says
/// plainly that it sends them back to the queue.
class _VehicleCard extends ConsumerWidget {
  const _VehicleCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final verification = ref.watch(verificationProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'What you deliver on',
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 12),
        verification.when(
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 20),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (error, _) => ErrorState(
            error: error,
            onRetry: () => ref.read(verificationProvider.notifier).refresh(),
          ),
          data: (details) => details == null
              ? const _NothingSubmitted()
              : _Submitted(details: details),
        ),
      ],
    );
  }
}

class _NothingSubmitted extends StatelessWidget {
  const _NothingSubmitted();

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
              'You have not told us what you drive',
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Nobody can take deliveries until we have checked this.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 14),
            FilledButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => const DriverDetailsPage(),
                ),
              ),
              child: const Text('Tell us'),
            ),
          ],
        ),
      ),
    );
  }
}

class _Submitted extends StatelessWidget {
  const _Submitted({required this.details});

  final DriverVerification details;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _StatusChip(status: details.status),
            if (details.status == VerificationStatus.rejected &&
                details.decisionReason != null) ...[
              const SizedBox(height: 10),
              Text(
                details.decisionReason!,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.error,
                ),
              ),
            ],
            const SizedBox(height: 14),

            _Detail(label: 'Vehicle', value: details.vehicleType.label),
            if (details.licenceNumber != null)
              _Detail(label: 'Licence', value: details.licenceNumber!),
            if (details.vehicleRegistration != null)
              _Detail(
                label: 'Registration',
                value: details.vehicleRegistration!,
              ),
            _Detail(label: 'ID', value: details.idNumber),

            const SizedBox(height: 14),
            OutlinedButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => DriverDetailsPage(existing: details),
                ),
              ),
              child: const Text('Change these'),
            ),
            const SizedBox(height: 8),
            Text(
              'Changing any of this sends it back to be checked, so you '
              'cannot take deliveries again until it is approved.',
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

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});

  final VerificationStatus status;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    final (label, icon, background, foreground) = switch (status) {
      VerificationStatus.approved => (
        'Approved to deliver',
        Icons.verified_rounded,
        scheme.primaryContainer,
        scheme.onPrimaryContainer,
      ),
      VerificationStatus.pending => (
        'Being checked',
        Icons.hourglass_top_rounded,
        scheme.secondaryContainer,
        scheme.onSecondaryContainer,
      ),
      VerificationStatus.rejected => (
        'Turned down',
        Icons.cancel_rounded,
        scheme.errorContainer,
        scheme.onErrorContainer,
      ),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(AppTheme.radius),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 18, color: foreground),
          const SizedBox(width: 8),
          // "Approved to deliver" is wider than the card on a small phone,
          // so the label wraps rather than running off the edge.
          Flexible(
            child: Text(
              label,
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                fontWeight: FontWeight.w700,
                color: foreground,
              ),
            ),
          ),
        ],
      ),
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
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 104,
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
