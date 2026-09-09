/// The one place a sign-in or profile failure is rendered.
///
/// Both sources already carry customer-readable text: AuthFailure is
/// translated from Firebase's codes, and the API writes its messages for
/// customers. Anything else is a bug and gets something generic.
library;

import 'package:flutter/material.dart';

import '../../../core/auth/auth_repository.dart';
import '../../../core/network/api_exception.dart';

/// Shows whatever went wrong, in the customer's terms.
class AuthErrorBanner extends StatelessWidget {
  const AuthErrorBanner({super.key, required this.error});

  final Object error;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    // Both sources already carry customer-readable text: AuthFailure is
    // translated from Firebase's codes, and the API writes its messages for
    // customers. Anything else is a bug and gets something generic.
    final message = switch (error) {
      final AuthFailure failure => failure.message,
      final ApiException api => api.firstFieldError ?? api.message,
      _ => 'Something went wrong. Please try again.',
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: theme.colorScheme.errorContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(
            Icons.error_outline_rounded,
            size: 20,
            color: theme.colorScheme.onErrorContainer,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onErrorContainer,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
