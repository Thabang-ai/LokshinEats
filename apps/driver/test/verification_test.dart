/// Telling us what you drive, and waiting to be approved.
///
/// The app's half of a rule the API enforces: nobody delivers until a human
/// has approved them. These check the driver is shown where they stand
/// rather than a board of work they would be refused.
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/network/api_client.dart';
import 'package:lokshineats_core/providers.dart';

import 'package:lokshineats_driver/features/verification/models/driver_verification.dart';
import 'package:lokshineats_driver/features/verification/pages/verification_page.dart';

http.Response _json(int status, Object? body) => http.Response(
  jsonEncode(body),
  status,
  headers: const {'content-type': 'application/json'},
);

Map<String, Object?> profile({
  String vehicleType = 'motorbike',
  String status = 'pending',
  String? decisionReason,
}) => {
  'vehicleType': vehicleType,
  'licenceNumber': vehicleType == 'bicycle' ? null : 'DL-4482913',
  'vehicleRegistration': vehicleType == 'bicycle' ? null : 'CA 512 345',
  'idNumber': '9203145800084',
  'status': status,
  'decisionReason': decisionReason,
};

/// An API that answers with the given profile, and records submissions.
({List<Map<String, Object?>> submissions, ApiClient client}) api(
  Object? current, {
  Map<String, Object?>? afterSubmit,
}) {
  final submissions = <Map<String, Object?>>[];

  final client = ApiClient(
    httpClient: MockClient((request) async {
      if (request.method == 'POST') {
        submissions.add(jsonDecode(request.body) as Map<String, Object?>);
        return _json(201, {'data': afterSubmit ?? profile()});
      }
      return _json(200, {'data': current});
    }),
    baseUrl: 'http://api.test',
    tokenProvider: () async => 'test-id-token',
  );

  return (submissions: submissions, client: client);
}

Future<void> pump(WidgetTester tester, ApiClient client) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(client),
        isSignedInProvider.overrideWithValue(true),
      ],
      child: const MaterialApp(home: VerificationPage()),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  group('what the driver is shown', () {
    testWidgets('nothing submitted yet: the form', (tester) async {
      await pump(tester, api(null).client);

      expect(find.text('What do you deliver on?'), findsOneWidget);
      expect(find.text('Send for checking'), findsOneWidget);
    });

    testWidgets('submitted: told it is being checked, with what they sent', (
      tester,
    ) async {
      await pump(tester, api(profile()).client);

      expect(find.text('We are checking your details'), findsOneWidget);
      expect(find.text('Motorbike'), findsOneWidget);
      expect(find.text('DL-4482913'), findsOneWidget);
    });

    testWidgets('turned down: the reason, and the form again', (tester) async {
      // A refusal with no reason is one the driver resubmits unchanged.
      await pump(
        tester,
        api(
          profile(status: 'rejected', decisionReason: 'Licence has expired.'),
        ).client,
      );

      expect(find.text('Licence has expired.'), findsOneWidget);
      expect(find.text('Send again'), findsOneWidget);
    });
  });

  group('the form', () {
    testWidgets('asks a motorbike for a licence and a registration', (
      tester,
    ) async {
      await pump(tester, api(null).client);

      expect(find.text('Driving licence number'), findsOneWidget);
      expect(find.text('Motorbike registration number'), findsOneWidget);
    });

    testWidgets('asks a bicycle for neither', (tester) async {
      // The API rejects a bicycle that claims a licence, so offering the
      // field would be inviting a refusal.
      await pump(tester, api(null).client);

      await tester.tap(find.text('Bicycle'));
      await tester.pumpAndSettle();

      expect(find.text('Driving licence number'), findsNothing);
      expect(find.text('Bicycle registration number'), findsNothing);
    });

    testWidgets('will not send a motorbike without its papers', (tester) async {
      final a = api(null);
      await pump(tester, a.client);

      await tester.enterText(find.byType(TextFormField).last, '9203145800084');
      await tester.tap(find.text('Send for checking'));
      await tester.pumpAndSettle();

      expect(find.text('Enter your licence number.'), findsOneWidget);
      expect(a.submissions, isEmpty);
    });

    testWidgets('sends a bicycle with no licence fields at all', (
      tester,
    ) async {
      final a = api(null, afterSubmit: profile(vehicleType: 'bicycle'));
      await pump(tester, a.client);

      await tester.tap(find.text('Bicycle'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField).first, '9203145800084');
      await tester.tap(find.text('Send for checking'));
      await tester.pumpAndSettle();

      expect(a.submissions, hasLength(1));
      expect(a.submissions.single, {
        'vehicleType': 'bicycle',
        'idNumber': '9203145800084',
      });
    });

    testWidgets('a sent motorbike carries both papers', (tester) async {
      final a = api(null);
      await pump(tester, a.client);

      final fields = find.byType(TextFormField);
      await tester.enterText(fields.at(0), 'DL-4482913');
      await tester.enterText(fields.at(1), 'CA 512 345');
      await tester.enterText(fields.at(2), '9203145800084');
      await tester.tap(find.text('Send for checking'));
      await tester.pumpAndSettle();

      expect(a.submissions.single, {
        'vehicleType': 'motorbike',
        'idNumber': '9203145800084',
        'licenceNumber': 'DL-4482913',
        'vehicleRegistration': 'CA 512 345',
      });
    });
  });

  group('may this driver work', () {
    test('only once approved', () {
      DriverVerification at(String status) => DriverVerification.fromJson(
        profile(status: status) as Map<String, dynamic>,
      );

      expect(at('approved').mayDeliver, isTrue);
      expect(at('pending').mayDeliver, isFalse);
      expect(at('rejected').mayDeliver, isFalse);
    });
  });
}
