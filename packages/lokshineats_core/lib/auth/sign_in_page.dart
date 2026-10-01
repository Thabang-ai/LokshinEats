/// Sign in, and the route to signing up.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/auth/auth_error_banner.dart';
import 'package:lokshineats_core/auth/auth_form_fields.dart';
import 'sign_up_page.dart';

class SignInPage extends ConsumerStatefulWidget {
  const SignInPage({super.key});

  @override
  ConsumerState<SignInPage> createState() => _SignInPageState();
}

class _SignInPageState extends ConsumerState<SignInPage> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    final ok = await ref
        .read(authControllerProvider.notifier)
        .signIn(email: _email.text, password: _password.text);

    if (ok && mounted) Navigator.of(context).pop();
  }

  Future<void> _resetPassword() async {
    // The reset only needs an email, so validate that field alone rather than
    // demanding a password the customer has by definition forgotten.
    final error = EmailField.validate(_email.text);
    if (error != null) {
      _showMessage('Enter your email address first, then tap this again.');
      return;
    }

    final ok = await ref
        .read(authControllerProvider.notifier)
        .sendPasswordReset(_email.text);

    if (ok) {
      _showMessage('Check your email for a link to reset your password.');
    }
  }

  void _showMessage(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final state = ref.watch(authControllerProvider);
    final busy = state.isLoading;

    // Errors are surfaced inline rather than as a snackbar: on a form, the
    // message belongs next to what the customer has to change.
    ref.listen(authControllerProvider, (_, next) {
      if (next.hasError) setState(() {});
    });

    return Scaffold(
      appBar: AppBar(title: const Text('Sign in')),
      body: SafeArea(
        child: AutofillGroup(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
            children: [
              Text(
                'Welcome back',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                ref.watch(authCopyProvider).signIn,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 24),

              Form(
                key: _formKey,
                child: Column(
                  children: [
                    EmailField(controller: _email),
                    const SizedBox(height: 14),
                    PasswordField(
                      controller: _password,
                      onSubmitted: (_) => busy ? null : _submit(),
                    ),
                  ],
                ),
              ),

              if (state.hasError) ...[
                const SizedBox(height: 16),
                AuthErrorBanner(error: state.error!),
              ],

              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: busy ? null : _resetPassword,
                  child: const Text('Forgot password?'),
                ),
              ),

              const SizedBox(height: 8),
              FilledButton(
                onPressed: busy ? null : _submit,
                child: busy
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Sign in'),
              ),

              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    'New here?',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  TextButton(
                    onPressed: busy
                        ? null
                        : () => Navigator.of(context).pushReplacement(
                            MaterialPageRoute<void>(
                              builder: (_) => const SignUpPage(),
                            ),
                          ),
                    child: const Text('Create an account'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
