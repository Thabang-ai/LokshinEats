/// The driver's account page.
///
/// It was a name and a Sign out button, and a driver asking "where is my
/// application" had nowhere to look. These check it answers that, in each
/// state the answer differs: not applied, waiting, turned down, approved.
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/auth/user_profile.dart';
import 'package:lokshineats_core/network/api_client.dart';
import 'package:lokshineats_core/providers.dart';

import 'package:lokshineats_driver/features/account/pages/driver_account_page.dart';

http.Response _json(int status, Object? body) => http.Response(
  jsonEncode(body),
  status,
  headers: const {'content-type': 'application/json'},
);

Map<String, Object?> me({String phone = '0784374760'}) => {
  'id': 'drv-1',
  'email': 'raymond@example.test',
  'displayName': 'Raymond Tshoeu',
  'role': 'driver',
  'phone': phone,
};

Map<String, Object?> vehicle({
  String status = 'approved',
  String vehicleType = 'motorbike',
  String? decisionReason,
}) => {
  'vehicleType': vehicleType,
  'licenceNumber': vehicleType == 'bicycle' ? null : 'DL-4482913',
  'vehicleRegistration': vehicleType == 'bicycle' ? null : 'CA 512 345',
  'idNumber': '9203145800084',
  'status': status,
  'decisionReason': decisionReason,
};

ApiClient _api(Object? verification) => ApiClient(
  httpClient: MockClient((request) async {
    if (request.url.path == '/api/v1/drivers/me') {
      return _json(200, {'data': verification});
    }
    return _json(200, {'data': <Object>[]});
  }),
  baseUrl: 'http://api.test',
  tokenProvider: () async => 'test-id-token',
);

/// A phone-sized screen, because the status chip is as wide as the card.
Future<void> pump(
  WidgetTester tester, {
  Map<String, Object?>? profile,
  Map<String, Object?>? verification,
  Size physicalSize = const Size(1080, 2400),
  double devicePixelRatio = 3,
}) async {
  tester.view.physicalSize = physicalSize;
  tester.view.devicePixelRatio = devicePixelRatio;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(_api(verification)),
        isSignedInProvider.overrideWithValue(true),
        // The real one reads the profile only once Firebase has a user, which
        // a test has no way to give it.
        profileProvider.overrideWith(
          (ref) async => profile == null
              ? null
              : UserProfile.fromJson(profile as Map<String, dynamic>),
        ),
      ],
      child: const MaterialApp(home: Scaffold(body: DriverAccountPage())),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('shows who the API has them down as', (tester) async {
    await pump(tester, profile: me(), verification: vehicle());

    expect(find.text('Raymond Tshoeu'), findsWidgets);
    expect(find.text('raymond@example.test'), findsOneWidget);
    expect(find.text('0784374760'), findsOneWidget);
    expect(find.text('Edit your details'), findsOneWidget);
  });

  testWidgets('approved: the vehicle, its papers, and that it passed', (
    tester,
  ) async {
    await pump(tester, profile: me(), verification: vehicle());

    expect(find.text('Approved to deliver'), findsOneWidget);
    expect(find.text('Motorbike'), findsOneWidget);
    expect(find.text('DL-4482913'), findsOneWidget);
    expect(find.text('CA 512 345'), findsOneWidget);
    expect(find.text('9203145800084'), findsOneWidget);
  });

  testWidgets('waiting: says so rather than showing nothing', (tester) async {
    // The question this page exists to answer.
    await pump(
      tester,
      profile: me(),
      verification: vehicle(status: 'pending'),
    );

    expect(find.text('Being checked'), findsOneWidget);
  });

  testWidgets('turned down: the status and the reason given', (tester) async {
    await pump(
      tester,
      profile: me(),
      verification: vehicle(
        status: 'rejected',
        decisionReason: 'Licence has expired.',
      ),
    );

    expect(find.text('Turned down'), findsOneWidget);
    expect(find.text('Licence has expired.'), findsOneWidget);
  });

  testWidgets('never applied: asked to, not left guessing', (tester) async {
    await pump(tester, profile: me(), verification: null);

    expect(find.text('You have not told us what you drive'), findsOneWidget);
    expect(find.text('Tell us'), findsOneWidget);
  });

  testWidgets('a bicycle is not asked about papers it cannot have', (
    tester,
  ) async {
    await pump(
      tester,
      profile: me(),
      verification: vehicle(vehicleType: 'bicycle'),
    );

    expect(find.text('Bicycle'), findsOneWidget);
    expect(find.text('Licence'), findsNothing);
    expect(find.text('Registration'), findsNothing);
  });

  testWidgets('changing the details opens the form filled in', (tester) async {
    await pump(tester, profile: me(), verification: vehicle());

    await tester.tap(find.text('Change these'));
    await tester.pumpAndSettle();

    expect(find.text('Change your details'), findsOneWidget);
    expect(find.text('What do you deliver on?'), findsOneWidget);
    // Filled in from what they sent before, not blank.
    expect(find.text('DL-4482913'), findsOneWidget);
  });

  testWidgets('fits a small phone', (tester) async {
    // "Approved to deliver" beside its icon is as wide as the card, and a
    // RenderFlex that overflows fails the test rather than just looking bad.
    await pump(
      tester,
      profile: me(),
      verification: vehicle(),
      // 320 logical pixels across: the narrowest phone still in use.
      physicalSize: const Size(640, 1136),
      devicePixelRatio: 2,
    );

    expect(find.text('Approved to deliver'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('no phone number saved is said, not left blank', (tester) async {
    await pump(
      tester,
      profile: me(phone: ''),
      verification: vehicle(),
    );

    expect(find.text('Not set'), findsOneWidget);
  });
}
