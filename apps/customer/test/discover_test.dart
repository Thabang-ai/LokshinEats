/// The front page, and the ways off it.
///
/// Built to match the website's home page. What matters here is not that it
/// looks the same - a test cannot see that - but that nothing on it is
/// decoration: every tile and button lands you on the kitchens tab, looking
/// at the thing you tapped.
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

import 'package:lokshineats_customer/features/shell/providers/shell_providers.dart';
import 'package:lokshineats_customer/features/stores/models/food_category.dart';
import 'package:lokshineats_customer/features/stores/pages/discover_page.dart';
import 'package:lokshineats_customer/features/stores/providers/store_providers.dart';

http.Response _json(Object? body) => http.Response(
  jsonEncode(body),
  200,
  headers: const {'content-type': 'application/json'},
);

Map<String, Object?> store(String id, String name, double rating) => {
  'id': id,
  'name': name,
  'cuisine': 'Traditional Township Food',
  'description': 'Mashed with love.',
  'address': '12 Khozi Street',
  'city': 'Meadowlands',
  'categories': <String>['Pap & Vleis'],
  'rating': rating,
  'reviewCount': 2,
  'deliveryTime': '30-45 min',
  'deliveryFee': 15.0,
  'minOrderAmount': 30.0,
  'isOpen': true,
};

ApiClient _api(List<Map<String, Object?>> stores) => ApiClient(
  httpClient: MockClient((request) async {
    if (request.url.path == '/api/v1/stores') return _json({'data': stores});
    return _json({'data': <Object>[]});
  }),
  baseUrl: 'http://api.test',
  tokenProvider: () async => null,
);

/// Bring a section into view. The page is a lazy list, so a widget below the
/// fold does not exist until it is scrolled to - and the search field and the
/// grid are scrollables of their own, so the page's is named.
Future<void> scrollTo(WidgetTester tester, Finder target) async {
  await tester.scrollUntilVisible(
    target,
    300,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.pumpAndSettle();
}

Future<ProviderContainer> pump(
  WidgetTester tester, {
  List<Map<String, Object?>> stores = const [],
}) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  final container = ProviderContainer(
    overrides: [
      apiClientProvider.overrideWithValue(_api(stores)),
      isSignedInProvider.overrideWithValue(false),
    ],
  );
  addTearDown(container.dispose);

  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(home: DiscoverPage()),
    ),
  );
  await tester.pumpAndSettle();

  return container;
}

void main() {
  testWidgets('leads with the website\'s own words', (tester) async {
    await pump(tester);

    expect(
      find.textContaining('Township Flavors', findRichText: true),
      findsOneWidget,
    );
    expect(
      find.textContaining('Experience authentic township cuisine'),
      findsOneWidget,
    );
    expect(find.text('Find Food'), findsOneWidget);
  });

  testWidgets('offers all eight cravings', (tester) async {
    await pump(tester);

    expect(find.text('What are you craving?'), findsOneWidget);
    for (final category in foodCategories) {
      await scrollTo(tester, find.text(category.name));
      expect(
        find.text(category.name),
        findsWidgets,
        reason: '${category.name} should be on the home page',
      );
    }
  });

  testWidgets('tapping a craving searches for it on the kitchens tab', (
    tester,
  ) async {
    // The whole point of the grid: it is the search the list already does,
    // not a new kind of filter.
    final container = await pump(tester);

    await scrollTo(tester, find.text('Bunny Chow'));
    await tester.tap(find.text('Bunny Chow'));
    await tester.pumpAndSettle();

    expect(container.read(storeSearchQueryProvider), 'Bunny Chow');
    expect(container.read(selectedTabProvider), HomeTab.kitchens);
  });

  testWidgets('searching from the hero carries the words across', (
    tester,
  ) async {
    final container = await pump(tester);

    await tester.enterText(find.byType(TextField).first, 'kota');
    await tester.tap(find.text('Find Food'));
    await tester.pumpAndSettle();

    expect(container.read(storeSearchQueryProvider), 'kota');
    expect(container.read(selectedTabProvider), HomeTab.kitchens);
  });

  testWidgets('popular near you is the best rated, three at most', (
    tester,
  ) async {
    await pump(
      tester,
      stores: [
        store('a', 'Third Best', 3.1),
        store('b', 'The Best', 5),
        store('c', 'Fourth Best', 2),
        store('d', 'Second Best', 4.4),
      ],
    );

    await scrollTo(tester, find.text('Popular Near You'));

    expect(find.text('Popular Near You'), findsOneWidget);
    await scrollTo(tester, find.text('The Best'));
    expect(find.text('The Best'), findsOneWidget);
    expect(find.text('Second Best'), findsOneWidget);
    expect(find.text('Third Best'), findsOneWidget);
    expect(find.text('Fourth Best'), findsNothing);
  });

  testWidgets('no kitchens yet is said plainly', (tester) async {
    await pump(tester);
    await scrollTo(
      tester,
      find.textContaining('No kitchens are open in your area yet'),
    );

    expect(
      find.textContaining('No kitchens are open in your area yet'),
      findsOneWidget,
    );
  });

  testWidgets('the closing invitation opens the kitchens', (tester) async {
    final container = await pump(tester);

    await scrollTo(tester, find.text('Browse Restaurants'));
    await tester.tap(find.text('Browse Restaurants'));
    await tester.pumpAndSettle();

    expect(container.read(selectedTabProvider), HomeTab.kitchens);
    // Browsing everything, not a leftover search from earlier.
    expect(container.read(storeSearchQueryProvider), '');
  });

  testWidgets('fits a small phone with no overflow', (tester) async {
    tester.view.physicalSize = const Size(640, 1136);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);

    await pump(tester, stores: [store('a', "Mini's Mashy Eatery", 5)]);
    await scrollTo(tester, find.text('Browse Restaurants'));

    expect(tester.takeException(), isNull);
  });
}
