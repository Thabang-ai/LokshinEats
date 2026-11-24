/// What a kitchen waiting on LokshinEats is told.
///
/// Before this, a kitchen that had not been approved saw an empty order
/// queue, an open switch that answered "Could not change that. Try again.",
/// and nothing anywhere explaining why. The API had refused it for a good
/// reason; the app simply did not say so.
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

import 'package:lokshineats_vendor/features/shell/pages/vendor_home_page.dart';
import 'package:lokshineats_vendor/features/store/models/store.dart';
import 'package:lokshineats_vendor/features/store/providers/store_providers.dart';

Map<String, Object?> storeJson({
  String? verification,
  String? verificationReason,
  bool isOpen = false,
}) => {
  'id': 'store-1',
  'name': "Mini's Mashy Eatery",
  'cuisine': 'Traditional Township Food',
  'address': '12 Khozi Street',
  'city': 'Meadowlands',
  'isOpen': isOpen,
  'deliveryFee': 12.0,
  'minOrderAmount': 30.0,
  'deliveryTime': '30-45 min',
  'verification': ?verification,
  'verificationReason': ?verificationReason,
};

ApiClient _api() => ApiClient(
  httpClient: MockClient(
    (request) async => http.Response(
      jsonEncode({'data': <Object>[]}),
      200,
      headers: const {'content-type': 'application/json'},
    ),
  ),
  baseUrl: 'http://api.test',
  tokenProvider: () async => 'test-id-token',
);

/// The kitchen, without the repository behind it.
///
/// `storeRepositoryProvider` builds a real Firebase auth repository, which
/// cannot exist in a widget test, so the store is supplied directly - the
/// same way every other screen test in this app does it.
class _FixedStore extends MyStoreNotifier {
  _FixedStore(this.store);

  final Store store;

  @override
  Future<Store?> build() async => store;
}

Future<void> pump(WidgetTester tester, Map<String, Object?> store) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(_api()),
        isSignedInProvider.overrideWithValue(true),
        needsProfileProvider.overrideWithValue(false),
        myStoreProvider.overrideWith(
          () => _FixedStore(Store.fromJson(store as Map<String, dynamic>)),
        ),
      ],
      child: const MaterialApp(home: VendorHomePage()),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a kitchen still being checked is told so, where the orders '
      'would be', (tester) async {
    await pump(tester, storeJson(verification: 'pending'));

    expect(
      find.text('LokshinEats is checking your kitchen'),
      findsOneWidget,
    );
    expect(find.textContaining('Nobody can order from you'), findsOneWidget);
  });

  testWidgets('and is not offered a switch that cannot work', (tester) async {
    // The API refuses it, so the switch could only ever fail.
    await pump(tester, storeJson(verification: 'pending'));

    expect(find.byType(Switch), findsNothing);
  });

  testWidgets('can still get on with its menu while it waits', (tester) async {
    await pump(tester, storeJson(verification: 'pending'));

    expect(find.text('Menu'), findsWidgets);
    expect(find.text('Earnings'), findsWidgets);
  });

  testWidgets('a kitchen turned down reads the reason it was given', (
    tester,
  ) async {
    await pump(
      tester,
      storeJson(
        verification: 'rejected',
        verificationReason: 'The address is a vacant lot.',
      ),
    );

    expect(find.text('LokshinEats turned this kitchen down'), findsOneWidget);
    expect(find.text('The address is a vacant lot.'), findsOneWidget);
  });

  testWidgets('an approved kitchen sees its queue and its switch', (
    tester,
  ) async {
    await pump(tester, storeJson(verification: 'approved', isOpen: true));

    expect(find.byType(Switch), findsOneWidget);
    expect(
      find.text('LokshinEats is checking your kitchen'),
      findsNothing,
    );
  });

  testWidgets('a kitchen from before the queue is not locked out of its own '
      'app', (tester) async {
    // Every kitchen trading today carries no verification field at all.
    await pump(tester, storeJson(isOpen: true));

    expect(find.byType(Switch), findsOneWidget);
    expect(find.textContaining('checking your kitchen'), findsNothing);
  });
}
