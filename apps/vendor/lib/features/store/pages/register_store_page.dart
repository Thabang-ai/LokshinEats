/// Registering a kitchen.
///
/// This screen is also how someone becomes a vendor: any signed-in account
/// may register a store, and doing so is what grants the role. That is why
/// the vendor app signs people up as ordinary accounts and asks this
/// immediately afterwards — there is no way to ask the API for the vendor
/// role directly, and there should not be.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/auth/auth_form_fields.dart';
import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/network/api_exception.dart';

import '../providers/store_providers.dart';

class RegisterStorePage extends ConsumerStatefulWidget {
  const RegisterStorePage({super.key});

  @override
  ConsumerState<RegisterStorePage> createState() => _RegisterStorePageState();
}

class _RegisterStorePageState extends ConsumerState<RegisterStorePage> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _cuisine = TextEditingController();
  final _address = TextEditingController();
  final _city = TextEditingController();
  final _phone = TextEditingController();

  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _cuisine.dispose();
    _address.dispose();
    _city.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      await ref
          .read(myStoreProvider.notifier)
          .register(
            name: _name.text,
            cuisine: _cuisine.text,
            address: _address.text,
            city: _city.text,
            phone: _phone.text,
          );
    } on ApiException catch (error) {
      if (mounted) {
        setState(() => _error = error.firstFieldError ?? error.message);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Your kitchen'),
        actions: [
          TextButton(
            onPressed: _busy ? null : _signOut,
            child: const Text('Sign out'),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
          children: [
            Text(
              'Set up your kitchen',
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'This is what customers see when they find you. You can change '
              'any of it later.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 24),

            Form(
              key: _formKey,
              child: Column(
                children: [
                  _Field(
                    controller: _name,
                    label: 'Kitchen name',
                    hint: 'Mama Ntuli Kota Corner',
                    minLength: 2,
                    message: 'What do customers call your kitchen?',
                  ),
                  const SizedBox(height: 14),
                  _Field(
                    controller: _cuisine,
                    label: 'What you cook',
                    hint: 'Kota, braai, chesa nyama',
                    minLength: 2,
                    message: 'Say what you cook, in a word or two.',
                  ),
                  const SizedBox(height: 14),
                  _Field(
                    controller: _address,
                    label: 'Street address',
                    hint: '12 Vilakazi Street',
                    minLength: 3,
                    message: 'Drivers need somewhere to collect from.',
                  ),
                  const SizedBox(height: 14),
                  _Field(
                    controller: _city,
                    label: 'Township or city',
                    hint: 'Soweto',
                    minLength: 2,
                    message: 'Enter your township or city.',
                  ),
                  const SizedBox(height: 14),
                  PhoneField(controller: _phone),
                ],
              ),
            ),

            if (_error != null) ...[
              const SizedBox(height: 16),
              Text(
                _error!,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.error,
                ),
              ),
            ],

            const SizedBox(height: 24),
            FilledButton(
              onPressed: _busy ? null : _submit,
              child: _busy
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Open my kitchen'),
            ),
          ],
        ),
      ),
    );
  }

  void _signOut() => ref.read(authControllerProvider.notifier).signOut();
}

/// A plain required text field, with the kitchen's own words for what is
/// wrong rather than the API's field names.
class _Field extends StatelessWidget {
  const _Field({
    required this.controller,
    required this.label,
    required this.hint,
    required this.minLength,
    required this.message,
  });

  final TextEditingController controller;
  final String label;
  final String hint;
  final int minLength;
  final String message;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      textCapitalization: TextCapitalization.words,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        border: const OutlineInputBorder(),
      ),
      validator: (value) =>
          (value ?? '').trim().length < minLength ? message : null,
    );
  }
}
