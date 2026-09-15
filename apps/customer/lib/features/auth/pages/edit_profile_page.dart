/// Editing the customer's own profile: name, mobile number and address.
///
/// The address is all or nothing. A street with no city cannot fill in a
/// checkout, and the API refuses to save one — so the form says so before the
/// request instead of after it. Clearing all three removes the saved address.
///
/// Email is shown but not editable here: it is the sign-in identity, and
/// changing it safely needs re-authentication and verification that belong in
/// their own flow.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_theme.dart';
import '../models/user_profile.dart';
import '../providers/auth_providers.dart';
import '../widgets/auth_form_fields.dart';

class EditProfilePage extends ConsumerStatefulWidget {
  const EditProfilePage({super.key, required this.profile});

  /// The profile as it was when the customer chose to edit it.
  final UserProfile profile;

  @override
  ConsumerState<EditProfilePage> createState() => _EditProfilePageState();
}

class _EditProfilePageState extends ConsumerState<EditProfilePage> {
  final _formKey = GlobalKey<FormState>();

  late final _name = TextEditingController(text: widget.profile.displayName);
  late final _phone = TextEditingController(text: widget.profile.phone ?? '');
  late final _street = TextEditingController(
    text: widget.profile.address?.street ?? '',
  );
  late final _city = TextEditingController(
    text: widget.profile.address?.city ?? '',
  );
  late final _postalCode = TextEditingController(
    text: widget.profile.address?.postalCode ?? '',
  );

  static final RegExp _postalPattern = RegExp(r'^[0-9]{4}$');

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _street.dispose();
    _city.dispose();
    _postalCode.dispose();
    super.dispose();
  }

  bool get _addressBlank =>
      _street.text.trim().isEmpty &&
      _city.text.trim().isEmpty &&
      _postalCode.text.trim().isEmpty;

  /// Each address field is optional on its own terms only while all three are
  /// blank. Once one is filled, the rest are required.
  String? _requiredInAddress(String? value, String message) {
    if (_addressBlank) return null;
    return (value ?? '').trim().isEmpty ? message : null;
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();

    final saved = await ref.read(profileControllerProvider.notifier).save(
      displayName: _name.text,
      phone: _phone.text,
      address: _addressBlank
          ? null
          : ProfileAddress(
              street: _street.text.trim(),
              city: _city.text.trim(),
              postalCode: _postalCode.text.trim(),
            ),
    );

    if (!saved || !mounted) return;

    final messenger = ScaffoldMessenger.of(context);
    await Navigator.of(context).maybePop();
    messenger.showSnackBar(const SnackBar(content: Text('Profile saved')));
  }

  void _clearAddress() {
    setState(() {
      _street.clear();
      _city.clear();
      _postalCode.clear();
    });
    // Clears the "add the rest of your address" errors along with the text.
    _formKey.currentState?.validate();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final saving = ref.watch(profileControllerProvider);
    final busy = saving.isLoading;

    return Scaffold(
      appBar: AppBar(title: const Text('Edit profile')),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
            children: [
              if (saving.hasError) _SaveError(error: saving.error!),

              NameField(controller: _name),
              const SizedBox(height: 14),
              // Required here even though sign-up allowed skipping it: every
              // order needs a number the driver can call, and checkout would
              // ask for it anyway.
              PhoneField(controller: _phone),
              const SizedBox(height: 14),
              TextFormField(
                initialValue: widget.profile.email,
                enabled: false,
                decoration: const InputDecoration(
                  labelText: 'Email',
                  prefixIcon: Icon(Icons.alternate_email_rounded),
                  helperText: 'Your sign-in email cannot be changed here.',
                ),
              ),

              const SizedBox(height: 28),
              Row(
                children: [
                  Icon(
                    Icons.place_outlined,
                    size: 18,
                    color: theme.colorScheme.primary,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Delivery address',
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  if (!_addressBlank)
                    TextButton(
                      onPressed: busy ? null : _clearAddress,
                      child: const Text('Clear'),
                    ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                'Saved here, it fills in checkout for you.',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _street,
                textCapitalization: TextCapitalization.words,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.streetAddressLine1],
                onChanged: (_) => setState(() {}),
                validator: (value) {
                  final required = _requiredInAddress(
                    value,
                    'Add your street, or clear the address.',
                  );
                  if (required != null) return required;
                  if (!_addressBlank && value!.trim().length < 3) {
                    return 'Enter your street address.';
                  }
                  return null;
                },
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
                      controller: _city,
                      textCapitalization: TextCapitalization.words,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.addressCity],
                      onChanged: (_) => setState(() {}),
                      validator: (value) {
                        final required = _requiredInAddress(
                          value,
                          'Add your town or city.',
                        );
                        if (required != null) return required;
                        if (!_addressBlank && value!.trim().length < 2) {
                          return 'Enter your town or city.';
                        }
                        return null;
                      },
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
                      controller: _postalCode,
                      keyboardType: TextInputType.number,
                      textInputAction: TextInputAction.done,
                      autofillHints: const [AutofillHints.postalCode],
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(4),
                      ],
                      onChanged: (_) => setState(() {}),
                      validator: (value) {
                        final required = _requiredInAddress(
                          value,
                          'Four digits.',
                        );
                        if (required != null) return required;
                        if (!_addressBlank &&
                            !_postalPattern.hasMatch(value!.trim())) {
                          return 'Four digits.';
                        }
                        return null;
                      },
                      decoration: const InputDecoration(
                        labelText: 'Postal code',
                        hintText: '1804',
                      ),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 32),
              FilledButton(
                onPressed: busy ? null : _save,
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                ),
                child: busy
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2.5),
                      )
                    : const Text('Save changes'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The API's own message when a save fails.
///
/// A field message is more specific than the summary, so it wins — for a
/// rejected postal code that is "Enter a 4-digit postal code." rather than
/// "Validation failed".
class _SaveError extends StatelessWidget {
  const _SaveError({required this.error});

  final Object error;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final message = error is ApiException
        ? (error as ApiException).firstFieldError ??
              (error as ApiException).message
        : 'Could not save your profile. Please try again.';

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: scheme.errorContainer,
        borderRadius: BorderRadius.circular(AppTheme.radius),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.error_outline_rounded,
            size: 20,
            color: scheme.onErrorContainer,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: scheme.onErrorContainer),
            ),
          ),
        ],
      ),
    );
  }
}
