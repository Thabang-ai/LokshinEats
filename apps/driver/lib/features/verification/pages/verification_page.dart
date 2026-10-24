/// What a driver has to tell us before they can work, and where they wait.
///
/// Three states, each honest about where the driver stands:
///
///   nothing submitted  the form
///   pending            "we are checking", with what they sent
///   rejected           why, and the form again
///
/// The form asks for a licence and a registration only when the vehicle needs
/// them - a bicycle has neither, and the API rejects a bicycle that claims
/// one, so showing the fields would be inviting a refusal.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/network/api_exception.dart';
import 'package:lokshineats_core/widgets/async_states.dart';

import '../models/driver_verification.dart';
import '../providers/verification_providers.dart';

class VerificationPage extends ConsumerWidget {
  const VerificationPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final verification = ref.watch(verificationProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Before you can deliver')),
      body: SafeArea(
        child: verification.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => ErrorState(
            error: error,
            onRetry: () => ref.read(verificationProvider.notifier).refresh(),
          ),
          data: (current) => switch (current?.status) {
            VerificationStatus.pending => _Waiting(verification: current!),
            _ => _DetailsForm(existing: current),
          },
        ),
      ),
    );
  }
}

/// Submitted, and nobody has decided yet.
class _Waiting extends ConsumerWidget {
  const _Waiting({required this.verification});

  final DriverVerification verification;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    return RefreshIndicator(
      onRefresh: () => ref.read(verificationProvider.notifier).refresh(),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
        children: [
          Icon(
            Icons.hourglass_top_rounded,
            size: 56,
            color: theme.colorScheme.primary,
          ),
          const SizedBox(height: 16),
          Text(
            'We are checking your details',
            textAlign: TextAlign.center,
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'You can take deliveries as soon as you are approved. Pull down '
            'to check.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 28),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _Fact(
                    label: 'You deliver on',
                    value: verification.vehicleType.label,
                  ),
                  if (verification.licenceNumber != null)
                    _Fact(label: 'Licence', value: verification.licenceNumber!),
                  if (verification.vehicleRegistration != null)
                    _Fact(
                      label: 'Registration',
                      value: verification.vehicleRegistration!,
                    ),
                  _Fact(label: 'ID', value: verification.idNumber),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),
          OutlinedButton(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => Scaffold(
                  appBar: AppBar(title: const Text('Change your details')),
                  body: SafeArea(child: _DetailsForm(existing: verification)),
                ),
              ),
            ),
            child: const Text('Something wrong? Change it'),
          ),
        ],
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
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

class _DetailsForm extends ConsumerStatefulWidget {
  const _DetailsForm({this.existing});

  final DriverVerification? existing;

  @override
  ConsumerState<_DetailsForm> createState() => _DetailsFormState();
}

class _DetailsFormState extends ConsumerState<_DetailsForm> {
  final _formKey = GlobalKey<FormState>();
  late VehicleType _vehicleType =
      widget.existing?.vehicleType ?? VehicleType.motorbike;
  late final _licence = TextEditingController(
    text: widget.existing?.licenceNumber ?? '',
  );
  late final _registration = TextEditingController(
    text: widget.existing?.vehicleRegistration ?? '',
  );
  late final _idNumber = TextEditingController(
    text: widget.existing?.idNumber ?? '',
  );

  bool _busy = false;

  @override
  void dispose() {
    _licence.dispose();
    _registration.dispose();
    _idNumber.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);

    try {
      await ref
          .read(verificationProvider.notifier)
          .submit(
            vehicleType: _vehicleType,
            idNumber: _idNumber.text,
            licenceNumber: _licence.text.trim(),
            vehicleRegistration: _registration.text.trim(),
          );

      if (!mounted) return;
      // A resubmission from the "change your details" screen leaves it; a
      // first submission is already on the page that will now show waiting.
      if (Navigator.of(context).canPop()) Navigator.of(context).pop();
    } on ApiException catch (error) {
      messenger.showSnackBar(
        SnackBar(content: Text(error.firstFieldError ?? error.message)),
      );
    } catch (_) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Could not send that. Try again.')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final rejected = widget.existing?.status == VerificationStatus.rejected;

    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
        children: [
          if (rejected) ...[
            Card(
              color: theme.colorScheme.errorContainer,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Your application was turned down',
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: theme.colorScheme.onErrorContainer,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      widget.existing?.decisionReason ??
                          'Check your details and send them again.',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: theme.colorScheme.onErrorContainer,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),
          ],

          Text(
            'What do you deliver on?',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'This decides which deliveries you are offered.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 12),
          SegmentedButton<VehicleType>(
            segments: [
              for (final type in VehicleType.values)
                ButtonSegment(value: type, label: Text(type.label)),
            ],
            selected: {_vehicleType},
            onSelectionChanged: (selection) =>
                setState(() => _vehicleType = selection.first),
          ),

          if (_vehicleType.needsPapers) ...[
            const SizedBox(height: 24),
            TextFormField(
              controller: _licence,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(
                labelText: 'Driving licence number',
              ),
              validator: (value) => (value ?? '').trim().length < 4
                  ? 'Enter your licence number.'
                  : null,
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _registration,
              textCapitalization: TextCapitalization.characters,
              decoration: InputDecoration(
                labelText: '${_vehicleType.label} registration number',
              ),
              validator: (value) => (value ?? '').trim().length < 4
                  ? 'Enter the registration number.'
                  : null,
            ),
          ],

          const SizedBox(height: 16),
          TextFormField(
            controller: _idNumber,
            keyboardType: TextInputType.text,
            decoration: const InputDecoration(
              labelText: 'ID or passport number',
            ),
            validator: (value) => (value ?? '').trim().length < 6
                ? 'Enter your ID or passport number.'
                : null,
          ),

          const SizedBox(height: 12),
          Text(
            'LokshinEats checks these before you can take deliveries. Keep '
            'your licence and registration with you while you work.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),

          const SizedBox(height: 24),
          FilledButton(
            onPressed: _busy ? null : _submit,
            child: _busy
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(rejected ? 'Send again' : 'Send for checking'),
          ),
        ],
      ),
    );
  }
}
