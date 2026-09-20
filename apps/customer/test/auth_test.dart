/// Auth tests.
///
/// The form validators and the error mapping are what a customer actually
/// runs into when something goes wrong, so they are worth pinning: a
/// validator that rejects a valid phone number, or an error banner that
/// leaks `wrong-password` at someone, are both silent until they happen.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lokshineats_core/auth/auth_repository.dart';
import 'package:lokshineats_core/network/api_exception.dart';
import 'package:lokshineats_core/theme/app_theme.dart';
import 'package:lokshineats_core/auth/user_profile.dart';
import 'package:lokshineats_core/auth/auth_error_banner.dart';
import 'package:lokshineats_core/auth/auth_form_fields.dart';

void main() {
  group('phone validation', () {
    test('accepts South African mobile numbers in both forms', () {
      // Matches the pattern the API enforces, so a number accepted here is
      // not rejected on the next screen.
      expect(PhoneField.validateRequired('0821234567'), isNull);
      expect(PhoneField.validateRequired('082 123 4567'), isNull);
      expect(PhoneField.validateRequired('+27821234567'), isNull);
      expect(PhoneField.validateRequired('0631234567'), isNull);
      expect(PhoneField.validateRequired('0711234567'), isNull);
    });

    test('rejects numbers that are not SA mobiles', () {
      expect(PhoneField.validateRequired(''), isNotNull);
      expect(PhoneField.validateRequired('12345'), isNotNull);
      // Landline prefix, not a mobile — a driver cannot reach it at the door.
      expect(PhoneField.validateRequired('0111234567'), isNotNull);
      expect(PhoneField.validateRequired('082123456'), isNotNull);
      expect(PhoneField.validateRequired('08212345678'), isNotNull);
    });

    test('treats an empty optional number as fine but still checks a typo', () {
      expect(PhoneField.validateOptional(''), isNull);
      expect(PhoneField.validateOptional('12345'), isNotNull);
    });
  });

  group('password validation', () {
    test('enforces Firebase’s six character floor on a new password', () {
      // Rejecting here saves a round trip and gives a clearer message than
      // Firebase's own `weak-password`.
      expect(PasswordField.validateNew('12345'), isNotNull);
      expect(PasswordField.validateNew('123456'), isNull);
      expect(PasswordField.validateNew(''), isNotNull);
    });

    test('only requires an existing password to be present', () {
      // The length rule must not apply at sign-in: an older account may have
      // a password that predates the rule.
      expect(PasswordField.validateExisting('12345'), isNull);
      expect(PasswordField.validateExisting(''), isNotNull);
    });
  });

  group('email validation', () {
    test('accepts an ordinary address', () {
      expect(EmailField.validate('customer@lokshin.test'), isNull);
    });

    test('rejects the obviously wrong, and leaves the rest to Firebase', () {
      expect(EmailField.validate(''), isNotNull);
      expect(EmailField.validate('nope'), isNotNull);
      expect(EmailField.validate('no@domain'), isNotNull);
    });
  });

  group('profile', () {
    test('reads the API shape', () {
      final profile = UserProfile.fromJson(const {
        'id': 'cust-1',
        'email': 'thabo@lokshin.test',
        'displayName': 'Thabo Nkosi',
        'phone': '0821234567',
        'role': 'customer',
      });

      expect(profile.firstName, 'Thabo');
      expect(profile.role, 'customer');
    });

    test('falls back to the email when there is no name', () {
      final profile = UserProfile.fromJson(const {
        'id': 'cust-1',
        'email': 'thabo@lokshin.test',
        'displayName': '',
      });

      // Never greets someone as an empty string.
      expect(profile.firstName, 'thabo');
    });

    test('defaults an unknown role to customer', () {
      final profile = UserProfile.fromJson(const {'id': 'x', 'email': 'a@b.c'});
      expect(profile.role, 'customer');
    });
  });

  group('error banner', () {
    Widget wrap(Object error) => ProviderScope(
      child: MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(body: AuthErrorBanner(error: error)),
      ),
    );

    testWidgets('shows the translated Firebase message', (tester) async {
      await tester.pumpWidget(
        wrap(
          const AuthFailure(
            'That email or password is not right.',
            code: 'invalid-credential',
          ),
        ),
      );

      expect(find.text('That email or password is not right.'), findsOneWidget);
      // The raw Firebase code must never reach a customer.
      expect(find.textContaining('invalid-credential'), findsNothing);
    });

    testWidgets('prefers the API field error over its summary', (tester) async {
      await tester.pumpWidget(
        wrap(
          ApiException(
            code: ApiErrorCode.validationFailed,
            status: 422,
            message: 'Some fields are invalid.',
            details: const {
              'phone': 'Enter a valid South African mobile number.',
            },
          ),
        ),
      );

      // The field message says what to change; the summary does not.
      expect(
        find.text('Enter a valid South African mobile number.'),
        findsOneWidget,
      );
    });

    testWidgets('says something generic for an unexpected failure', (
      tester,
    ) async {
      await tester.pumpWidget(wrap(StateError('boom')));

      expect(
        find.text('Something went wrong. Please try again.'),
        findsOneWidget,
      );
      // A stack trace or internal message must not leak into the UI.
      expect(find.textContaining('boom'), findsNothing);
    });
  });
}
