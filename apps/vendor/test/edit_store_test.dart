/// Changing what customers see.
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

import 'package:lokshineats_vendor/features/store/models/store.dart';
import 'package:lokshineats_vendor/features/store/pages/edit_store_page.dart';
import 'package:lokshineats_vendor/features/store/providers/store_providers.dart';
import 'package:lokshineats_vendor/features/store/repositories/store_repository.dart';

Map<String, Object?> storeJson({
  String name = "Mini's Mashy Eatery",
  String address = '12 Khozi Street',
}) => {
  'id': 'store-1',
  'name': name,
  'cuisine': 'Traditional Township Food',
  'description': 'Mashed with love.',
  'address': address,
  'city': 'Meadowlands',
  'phone': '0832007164',
  'isOpen': true,
  'deliveryFee': 15.0,
  'minOrderAmount': 30.0,
  'deliveryTime': '30-45 min',
  'rating': 5.0,
  'reviewCount': 2,
};

http.Response _json(int status, Object body) => http.Response(
  jsonEncode(body),
  status,
  headers: const {'content-type': 'application/json'},
);

/// Records what the app asks the API to change.
({List<Map<String, Object?>> patches, ApiClient client}) api() {
  final patches = <Map<String, Object?>>[];

  final client = ApiClient(
    httpClient: MockClient((request) async {
      if (request.method == 'PATCH') {
        final body = jsonDecode(request.body) as Map<String, Object?>;
        patches.add(body);
        return _json(200, {'data': {...storeJson(), ...body}});
      }
      return _json(200, {'data': storeJson()});
    }),
    baseUrl: 'http://api.test',
    tokenProvider: () async => 'test-id-token',
  );

  return (patches: patches, client: client);
}

Future<void> pump(WidgetTester tester, ApiClient client) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(client),
        isSignedInProvider.overrideWithValue(true),
        // The real repository refreshes the Firebase token after registering
        // a kitchen, which would reach Firebase itself in a test. Editing an
        // existing kitchen needs no refresh.
        storeRepositoryProvider.overrideWith(
          (ref) => StoreRepository(client, () async {}),
        ),
      ],
      child: MaterialApp(
        home: EditStorePage(
          store: Store.fromJson(storeJson() as Map<String, dynamic>),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// The form is longer than a phone screen, so Save has to be scrolled to.
Future<void> tapSave(WidgetTester tester) async {
  // The list builds lazily, so the button does not exist until scrolled to.
  // The text fields are scrollables too, so the form's own one is named.
  await tester.scrollUntilVisible(
    find.text('Save'),
    300,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.pumpAndSettle();
  await tester.tap(find.text('Save'));
  await tester.pumpAndSettle();
}

/// Back to the top, where the field with the complaint on it lives.
Future<void> scrollToTop(WidgetTester tester) async {
  await tester.drag(find.byType(Scrollable).first, const Offset(0, 2000));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('opens filled in with what the kitchen already is', (
    tester,
  ) async {
    await pump(tester, api().client);

    expect(find.text("Mini's Mashy Eatery"), findsOneWidget);
    expect(find.text('12 Khozi Street'), findsOneWidget);
    expect(find.text('Meadowlands'), findsOneWidget);
  });

  testWidgets('sends only what changed', (tester) async {
    // The screen does not ask about opening hours or photographs, so saving
    // must not send them - a PATCH that carried every field would blank
    // whatever this form happens not to know about.
    final a = api();
    await pump(tester, a.client);

    await tester.enterText(
      find.widgetWithText(TextFormField, "Mini's Mashy Eatery"),
      "Mini's Mashy Kitchen",
    );
    await tapSave(tester);

    expect(a.patches, hasLength(1));
    expect(a.patches.single, {'name': "Mini's Mashy Kitchen"});
  });

  testWidgets('a corrected address reaches the API', (tester) async {
    final a = api();
    await pump(tester, a.client);

    await tester.enterText(
      find.widgetWithText(TextFormField, '12 Khozi Street'),
      '14 Khozi Street',
    );
    await tapSave(tester);

    expect(a.patches.single, {'address': '14 Khozi Street'});
  });

  testWidgets('saving with nothing changed sends nothing to change', (
    tester,
  ) async {
    final a = api();
    await pump(tester, a.client);

    await tapSave(tester);

    expect(a.patches.single, isEmpty);
  });

  testWidgets('a kitchen cannot be left without a name', (tester) async {
    final a = api();
    await pump(tester, a.client);

    await tester.enterText(
      find.widgetWithText(TextFormField, "Mini's Mashy Eatery"),
      '',
    );
    await tapSave(tester);

    expect(a.patches, isEmpty);
    await scrollToTop(tester);
    expect(find.text('Your kitchen needs a name.'), findsOneWidget);
  });

  testWidgets('a kitchen cannot be left without an address', (tester) async {
    // Drivers collect from it.
    final a = api();
    await pump(tester, a.client);

    await tester.enterText(
      find.widgetWithText(TextFormField, '12 Khozi Street'),
      '',
    );
    await tapSave(tester);

    expect(a.patches, isEmpty);
    await scrollToTop(tester);
    expect(
      find.text('Drivers need an address to collect from.'),
      findsOneWidget,
    );
  });

  testWidgets('a changed delivery fee is sent as a number', (tester) async {
    final a = api();
    await pump(tester, a.client);

    // Far enough down the lazy list that it has to be scrolled to first.
    await tester.scrollUntilVisible(
      find.text('Delivery fee'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextFormField, '15.00'), '20');
    await tapSave(tester);

    expect(a.patches.single, {'deliveryFee': 20.0});
  });
}
