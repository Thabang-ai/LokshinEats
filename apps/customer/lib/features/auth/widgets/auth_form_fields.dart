/// Form fields shared by sign-in and sign-up.
///
/// The validators live here rather than being retyped per screen, so the two
/// forms cannot drift apart on what counts as a valid email or password.
///
/// These are convenience checks only. The API validates everything again —
/// phone format included — and its message is what the customer sees if it
/// disagrees, because the server is the one that decides.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class EmailField extends StatelessWidget {
  const EmailField({super.key, required this.controller, this.onSubmitted});

  final TextEditingController controller;
  final ValueChanged<String>? onSubmitted;

  static String? validate(String? value) {
    final email = value?.trim() ?? '';
    if (email.isEmpty) return 'Enter your email address.';
    // Deliberately loose: the real check is whether Firebase accepts it, and
    // an over-strict pattern rejects addresses that genuinely work.
    if (!email.contains('@') || !email.contains('.')) {
      return 'That does not look like an email address.';
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      validator: validate,
      onFieldSubmitted: onSubmitted,
      keyboardType: TextInputType.emailAddress,
      textInputAction: TextInputAction.next,
      autofillHints: const [AutofillHints.email],
      autocorrect: false,
      decoration: const InputDecoration(
        labelText: 'Email',
        hintText: 'you@example.com',
        prefixIcon: Icon(Icons.alternate_email_rounded),
      ),
    );
  }
}

class PasswordField extends StatefulWidget {
  const PasswordField({
    super.key,
    required this.controller,
    this.label = 'Password',
    this.isNew = false,
    this.onSubmitted,
  });

  final TextEditingController controller;
  final String label;

  /// True on sign-up, where a minimum length is enforced and the keyboard
  /// should offer to generate and save a password.
  final bool isNew;

  final ValueChanged<String>? onSubmitted;

  /// Firebase's own floor is 6 characters; rejecting shorter here saves a
  /// round trip and gives a clearer message.
  static String? validateNew(String? value) {
    final password = value ?? '';
    if (password.isEmpty) return 'Choose a password.';
    if (password.length < 6) {
      return 'Use at least 6 characters.';
    }
    return null;
  }

  static String? validateExisting(String? value) {
    if ((value ?? '').isEmpty) return 'Enter your password.';
    return null;
  }

  @override
  State<PasswordField> createState() => _PasswordFieldState();
}

class _PasswordFieldState extends State<PasswordField> {
  bool _obscured = true;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: widget.controller,
      obscureText: _obscured,
      validator: widget.isNew
          ? PasswordField.validateNew
          : PasswordField.validateExisting,
      onFieldSubmitted: widget.onSubmitted,
      textInputAction: TextInputAction.done,
      autofillHints: [
        widget.isNew ? AutofillHints.newPassword : AutofillHints.password,
      ],
      decoration: InputDecoration(
        labelText: widget.label,
        prefixIcon: const Icon(Icons.lock_outline_rounded),
        suffixIcon: IconButton(
          onPressed: () => setState(() => _obscured = !_obscured),
          icon: Icon(
            _obscured
                ? Icons.visibility_outlined
                : Icons.visibility_off_outlined,
          ),
          tooltip: _obscured ? 'Show password' : 'Hide password',
        ),
      ),
    );
  }
}

class NameField extends StatelessWidget {
  const NameField({super.key, required this.controller});

  final TextEditingController controller;

  static String? validate(String? value) {
    final name = value?.trim() ?? '';
    if (name.length < 2) return 'Enter your name.';
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      validator: validate,
      textCapitalization: TextCapitalization.words,
      textInputAction: TextInputAction.next,
      autofillHints: const [AutofillHints.name],
      decoration: const InputDecoration(
        labelText: 'Name',
        hintText: 'What should the driver call you?',
        prefixIcon: Icon(Icons.person_outline_rounded),
      ),
    );
  }
}

class PhoneField extends StatelessWidget {
  const PhoneField({super.key, required this.controller, this.optional = false});

  final TextEditingController controller;
  final bool optional;

  /// South African mobile numbers, local or international form. Matches the
  /// pattern the API enforces, so a number accepted here is not rejected on
  /// the next screen.
  static final RegExp _pattern = RegExp(r'^(?:\+27|0)[6-8][0-9]{8}$');

  static String? validateRequired(String? value) {
    final phone = (value ?? '').replaceAll(' ', '');
    if (phone.isEmpty) return 'Enter your mobile number.';
    if (!_pattern.hasMatch(phone)) {
      return 'Enter a valid SA mobile number, like 082 123 4567.';
    }
    return null;
  }

  static String? validateOptional(String? value) {
    final phone = (value ?? '').replaceAll(' ', '');
    if (phone.isEmpty) return null;
    return validateRequired(value);
  }

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      validator: optional ? validateOptional : validateRequired,
      keyboardType: TextInputType.phone,
      textInputAction: TextInputAction.next,
      autofillHints: const [AutofillHints.telephoneNumber],
      inputFormatters: [
        FilteringTextInputFormatter.allow(RegExp(r'[0-9+ ]')),
        LengthLimitingTextInputFormatter(15),
      ],
      decoration: InputDecoration(
        labelText: optional ? 'Mobile number (optional)' : 'Mobile number',
        hintText: '082 123 4567',
        prefixIcon: const Icon(Icons.phone_outlined),
        helperText: 'Your driver may call you about the delivery.',
      ),
    );
  }
}
