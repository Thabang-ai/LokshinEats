/// The bar across the top of the browsing tabs.
///
/// It shipped with the name set at headline size inside an Expanded column
/// next to four full-size buttons. On a 360dp phone - which is most phones -
/// there was no room for it, so it wrapped mid-word and the second line sat
/// over the tagline beneath. These pin the two things that stop it happening
/// again: one line, and room for it.
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

import 'package:lokshineats_customer/features/stores/widgets/home_header.dart';

ApiClient _api() => ApiClient(
  httpClient: MockClient(
    (request) async => http.Response(
      jsonEncode({'data': <Object>[]}),
      200,
      headers: const {'content-type': 'application/json'},
    ),
  ),
  baseUrl: 'http://api.test',
  tokenProvider: () async => null,
);

/// A 360dp-wide phone, which is the width the old header broke at.
Future<void> pump(
  WidgetTester tester, {
  bool signedIn = true,
  Size size = const Size(1080, 2400),
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(_api()),
        isSignedInProvider.overrideWithValue(signedIn),
      ],
      child: const MaterialApp(
        home: Scaffold(body: Column(children: [HomeHeader()])),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('fits a 360dp phone with every button showing', (tester) async {
    // The bug itself: signed in is four buttons, which is the crowded case.
    await pump(tester);

    expect(tester.takeException(), isNull);
  });

  testWidgets('fits a narrow phone too', (tester) async {
    await pump(tester, size: const Size(960, 2400));

    expect(tester.takeException(), isNull);
  });

  testWidgets('says the name once, on one line', (tester) async {
    await pump(tester);

    final name = tester.widget<RichText>(
      find.byWidgetPredicate(
        (widget) =>
            widget is RichText && widget.text.toPlainText() == 'LokshinEats',
      ),
    );
    expect(name.maxLines, 1);
    expect(name.softWrap, isFalse);
  });

  testWidgets('wears the badge the website wears', (tester) async {
    await pump(tester);

    expect(find.byType(Image), findsOneWidget);
  });

  testWidgets('signed out, the account button is the only way in', (
    tester,
  ) async {
    await pump(tester, signedIn: false);

    expect(find.byTooltip('Sign in'), findsOneWidget);
    expect(find.byTooltip('Your orders'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
