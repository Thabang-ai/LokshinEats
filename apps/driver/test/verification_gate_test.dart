/// What the driver app shows while it does not yet know whether you may work.
///
/// The bug this exists for: the gate asked `hasValue && !mayDeliver`, so an
/// unknown status counted as approved. On every cold start - and again
/// whenever Firebase re-emitted the signed-in user, which it does when it
/// refreshes a token - the driver was dropped into the tabs for a moment. A
/// driver filling in the form watched it vanish and found whichever tab they
/// had been on last.
library;

import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/network/api_client.dart';
import 'package:lokshineats_core/providers.dart';

import 'package:lokshineats_driver/features/shell/pages/driver_home_page.dart';

http.Response _json(int status, Object? body) => http.Response(
  jsonEncode(body),
  status,
  headers: const {'content-type': 'application/json'},
);

Map<String, Object?> verification(String status) => {
  'vehicleType': 'motorbike',
  'licenceNumber': 'DL-4482913',
  'vehicleRegistration': 'CA 512 345',
  'idNumber': '9203145800084',
  'status': status,
  'decisionReason': null,
};

/// An API whose answer about verification can be delayed, to hold the app in
/// the moment the bug lived in.
ApiClient apiHolding(Completer<Object?>? held, {Object? answer}) => ApiClient(
  httpClient: MockClient((request) async {
    if (request.url.path == '/api/v1/drivers/me') {
      final data = held == null ? answer : await held.future;
      return _json(200, {'data': data});
    }
    if (request.url.path == '/api/v1/users/me') {
      return _json(200, {
        'data': {
          'id': 'drv-1',
          'email': 'driver@example.test',
          'displayName': 'Sipho',
          'role': 'driver',
          'phone': '0821234567',
        },
      });
    }
    // Deliveries and anything else: empty, so a board would render if shown.
    return _json(200, {'data': <Object>[], 'meta': {'unread': 0}});
  }),
  baseUrl: 'http://api.test',
  tokenProvider: () async => 'test-id-token',
);

Future<void> pumpHome(WidgetTester tester, ApiClient client) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(client),
        isSignedInProvider.overrideWithValue(true),
        // The home page asks whether the API has a profile for this account
        // before it asks about verification; without this it reaches real
        // Firebase, finds nobody, and shows the finish-sign-up screen.
        needsProfileProvider.overrideWithValue(false),
      ],
      child: const MaterialApp(home: DriverHomePage()),
    ),
  );
  await tester.pump();
}

void main() {
  testWidgets('while the status is unknown, no board and no account page', (
    tester,
  ) async {
    final held = Completer<Object?>();
    await pumpHome(tester, apiHolding(held));
    await tester.pump(const Duration(milliseconds: 100));

    // Not the tabs: not the board, and not the account page a driver was
    // landing on mid-form.
    expect(find.text('Available'), findsNothing);
    expect(find.text('Sign out'), findsNothing);
    expect(find.byType(CircularProgressIndicator), findsWidgets);

    held.complete(verification('pending'));
    await tester.pumpAndSettle();
  });

  testWidgets('not approved: the verification screen, never the tabs', (
    tester,
  ) async {
    await pumpHome(tester, apiHolding(null, answer: verification('pending')));
    await tester.pumpAndSettle();

    expect(find.text('We are checking your details'), findsOneWidget);
    expect(find.text('Available'), findsNothing);
    expect(find.text('Sign out'), findsNothing);
  });

  testWidgets('no application at all: the form, never the tabs', (
    tester,
  ) async {
    await pumpHome(tester, apiHolding(null, answer: null));
    await tester.pumpAndSettle();

    expect(find.text('What do you deliver on?'), findsOneWidget);
    expect(find.text('Available'), findsNothing);
  });

  testWidgets('approved: the app proper', (tester) async {
    await pumpHome(tester, apiHolding(null, answer: verification('approved')));
    await tester.pumpAndSettle();

    expect(find.text('Available'), findsWidgets);
    expect(find.text('What do you deliver on?'), findsNothing);
  });
}
