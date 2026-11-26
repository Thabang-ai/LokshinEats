/// On the road, or not.
///
/// An approved driver was treated as available every hour of every day: the
/// board showed them work at two in the morning and every order buzzed every
/// phone. The switch is theirs, and the app's half of it has to be beside
/// the board - which is where they are standing when they decide they have
/// finished for the night.
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

import 'package:lokshineats_driver/features/shell/pages/driver_home_page.dart';

http.Response _json(int status, Object? body) => http.Response(
  jsonEncode(body),
  status,
  headers: const {'content-type': 'application/json'},
);

Map<String, Object?> approvedDriver({bool? isOnline}) => {
  'vehicleType': 'motorbike',
  'licenceNumber': 'DL-4482913',
  'vehicleRegistration': 'CA 512 345',
  'idNumber': '9203145800084',
  'status': 'approved',
  'decisionReason': null,
  'rating': 4.8,
  'ratingCount': 12,
  // Left out entirely for a driver approved before the switch existed.
  if (isOnline != null) 'isOnline': isOnline,
};

/// Records what the app asks the API to change, and answers with the result.
({List<Map<String, Object?>> patches, ApiClient client}) api({
  bool? isOnline,
}) {
  final patches = <Map<String, Object?>>[];
  var online = isOnline ?? true;

  final client = ApiClient(
    httpClient: MockClient((request) async {
      if (request.url.path.endsWith('/drivers/me/availability')) {
        final body = jsonDecode(request.body) as Map<String, Object?>;
        patches.add(body);
        online = body['online'] == true;
        return _json(200, {'data': approvedDriver(isOnline: online)});
      }

      if (request.url.path.endsWith('/drivers/me')) {
        return _json(200, {'data': approvedDriver(isOnline: isOnline)});
      }

      // The board, deliveries, notifications: empty but well formed.
      return _json(200, {
        'data': <Object>[],
        'meta': {'unread': 0},
      });
    }),
    baseUrl: 'http://api.test',
    tokenProvider: () async => 'test-id-token',
  );

  return (patches: patches, client: client);
}

Future<void> pumpHome(WidgetTester tester, ApiClient client) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(client),
        isSignedInProvider.overrideWithValue(true),
        needsProfileProvider.overrideWithValue(false),
      ],
      child: const MaterialApp(home: DriverHomePage()),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a driver who has never touched it is on the road', (
    tester,
  ) async {
    // No field at all: every driver approved before this existed.
    await pumpHome(tester, api().client);

    expect(find.text('On the road'), findsOneWidget);
    expect(tester.widget<Switch>(find.byType(Switch)).value, isTrue);
  });

  testWidgets('shows them as off when that is what they chose', (tester) async {
    await pumpHome(tester, api(isOnline: false).client);

    expect(find.text('Off'), findsOneWidget);
    expect(tester.widget<Switch>(find.byType(Switch)).value, isFalse);
  });

  testWidgets('going off the road tells the API so', (tester) async {
    final a = api();
    await pumpHome(tester, a.client);

    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();

    expect(a.patches.single, {'online': false});
    expect(find.text('Off'), findsOneWidget);
    expect(
      find.text('Off the road. Nothing new will be sent to you.'),
      findsOneWidget,
    );
  });

  testWidgets('and coming back on does too', (tester) async {
    final a = api(isOnline: false);
    await pumpHome(tester, a.client);

    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();

    expect(a.patches.single, {'online': true});
    expect(find.text('On the road'), findsOneWidget);
    expect(
      find.text('On the road. Deliveries will come to you again.'),
      findsOneWidget,
    );
  });

  testWidgets('the switch is not offered before anybody has approved them', (
    tester,
  ) async {
    // An unapproved driver sees the verification screen, not the tabs - so
    // there is nothing to flip, and nothing to mislead them into thinking
    // they are a tap away from working.
    final client = ApiClient(
      httpClient: MockClient((request) async {
        if (request.url.path.endsWith('/drivers/me')) {
          return _json(200, {
            'data': {...approvedDriver(), 'status': 'pending'},
          });
        }
        return _json(200, {
          'data': <Object>[],
          'meta': {'unread': 0},
        });
      }),
      baseUrl: 'http://api.test',
      tokenProvider: () async => 'test-id-token',
    );

    await pumpHome(tester, client);

    expect(find.byType(Switch), findsNothing);
  });
}
