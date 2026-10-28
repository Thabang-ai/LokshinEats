/// The bottom bar.
///
/// Orders and favourites used to appear only once you were signed in, which
/// left a signed-out customer looking at three tabs and wondering where the
/// rest had gone. The website shows all five either way, and both of those
/// pages already offer to sign you in - a better answer than a missing tab.
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

import 'package:lokshineats_customer/features/shell/pages/home_shell.dart';

ApiClient _api() => ApiClient(
  httpClient: MockClient((_) async {
    return http.Response(
      jsonEncode({'data': <Object>[]}),
      200,
      headers: const {'content-type': 'application/json'},
    );
  }),
  baseUrl: 'http://api.test',
  tokenProvider: () async => null,
);

Future<void> pump(WidgetTester tester, {required bool signedIn}) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(_api()),
        isSignedInProvider.overrideWithValue(signedIn),
      ],
      child: const MaterialApp(home: HomeShell()),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('all five tabs, signed out', (tester) async {
    await pump(tester, signedIn: false);

    for (final label in ['Home', 'Search', 'Orders', 'Favourites', 'Account']) {
      expect(
        find.widgetWithText(NavigationDestination, label),
        findsOneWidget,
        reason: '$label should be in the bar whether or not you are signed in',
      );
    }
  });

  testWidgets('all five tabs, signed in', (tester) async {
    await pump(tester, signedIn: true);

    expect(find.byType(NavigationDestination), findsNWidgets(5));
  });

  testWidgets('favourites invites a signed-out customer in', (tester) async {
    // The reason the tab can be shown at all.
    await pump(tester, signedIn: false);

    await tester.tap(find.widgetWithText(NavigationDestination, 'Favourites'));
    await tester.pumpAndSettle();

    expect(find.text('Sign in to save favourites'), findsOneWidget);
  });

  testWidgets('the app opens on the front page, not the list', (tester) async {
    await pump(tester, signedIn: false);

    expect(find.text('What are you craving?'), findsOneWidget);
  });
}
