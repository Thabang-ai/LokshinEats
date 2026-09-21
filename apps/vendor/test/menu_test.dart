/// The kitchen's menu.
///
/// Two things matter most. Prices must be read the way a South African
/// kitchen types them, and reach the API to the cent. And removing a dish
/// must not be the easy accident when what the kitchen meant was "sold out".
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

import 'package:lokshineats_vendor/features/menu/models/menu_item.dart';
import 'package:lokshineats_vendor/features/menu/pages/menu_item_form_page.dart';
import 'package:lokshineats_vendor/features/menu/pages/menu_page.dart';
import 'package:lokshineats_vendor/features/menu/repositories/menu_repository.dart';

Map<String, dynamic> dishJson({
  String id = 'dish-1',
  String name = 'Full House Kota',
  double price = 45.5,
  String category = 'Kotas',
  bool available = true,
}) => {
  'id': id,
  'storeId': 'store-1',
  'name': name,
  'description': 'Quarter loaf, chips, polony, cheese, egg',
  'price': price,
  'category': category,
  'available': available,
  'isVegetarian': false,
  'isSpicy': false,
  'preparationTime': 15,
};

http.Response _json(int status, Object body) => http.Response(
  jsonEncode(body),
  status,
  headers: {'content-type': 'application/json'},
);

ApiClient _client(http.Client inner) => ApiClient(
  httpClient: inner,
  baseUrl: 'http://api.test',
  tokenProvider: () async => 'test-id-token',
);

void main() {
  group('reading a price the way it is typed', () {
    test('a comma, a point, and a leading R all mean the same', () {
      expect(parseRands('45,50'), 45.5);
      expect(parseRands('45.50'), 45.5);
      expect(parseRands('R45.50'), 45.5);
      expect(parseRands('R 45'), 45);
      expect(parseRands(' 12 '), 12);
    });

    test('anything finer than a cent, or not a number, is refused', () {
      expect(parseRands('45.555'), isNull);
      expect(parseRands('forty'), isNull);
      expect(parseRands(''), isNull);
      expect(parseRands('45,5,0'), isNull);
    });

    test('a draft reaches the API rounded to the cent', () {
      final json = const MenuItemDraft(
        name: ' Kota ',
        price: 45.499999999,
        category: 'Kotas',
      ).toJson();

      expect(json['price'], 45.5);
      expect(json['name'], 'Kota');
    });
  });

  group('repository', () {
    test('reads the whole menu, following every page', () async {
      final requests = <http.Request>[];
      final repository = MenuRepository(
        _client(
          MockClient((request) async {
            requests.add(request);
            return request.url.queryParameters['cursor'] == null
                ? _json(200, {
                    'data': [dishJson()],
                    'nextCursor': 'dish-1',
                  })
                : _json(200, {
                    'data': [dishJson(id: 'dish-2', name: 'Slap Chips')],
                  });
          }),
        ),
      );

      final items = await repository.fetchMine();

      expect(items.map((i) => i.name), ['Full House Kota', 'Slap Chips']);
      expect(requests, hasLength(2));
      expect(requests.first.url.path, '/api/v1/products/mine');
      // Sold-out dishes must come back too; the kitchen has to see them.
      expect(requests.first.url.queryParameters['availableOnly'], isNull);
    });

    test('switching a dish off sends only that', () async {
      final requests = <http.Request>[];
      final repository = MenuRepository(
        _client(
          MockClient((request) async {
            requests.add(request);
            return _json(200, {'data': dishJson(available: false)});
          }),
        ),
      );

      await repository.setAvailable('dish-1', available: false);

      expect(requests.single.method, 'PATCH');
      expect(requests.single.url.path, '/api/v1/products/dish-1');
      expect(jsonDecode(requests.single.body), {'available': false});
    });

    test('removing a dish is a DELETE of that dish', () async {
      final requests = <http.Request>[];
      final repository = MenuRepository(
        _client(
          MockClient((request) async {
            requests.add(request);
            return http.Response('', 204);
          }),
        ),
      );

      await repository.remove('dish-1');

      expect(requests.single.method, 'DELETE');
      expect(requests.single.url.path, '/api/v1/products/dish-1');
    });
  });

  group('screens', () {
    Future<List<http.Request>> pump(
      WidgetTester tester, {
      required Widget home,
      required http.Response Function(http.Request request) respond,
    }) async {
      tester.view.physicalSize = const Size(1000, 2600);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final requests = <http.Request>[];
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            isSignedInProvider.overrideWithValue(true),
            apiClientProvider.overrideWithValue(
              _client(
                MockClient((request) async {
                  requests.add(request);
                  return respond(request);
                }),
              ),
            ),
          ],
          child: MaterialApp(home: home),
        ),
      );
      await tester.pumpAndSettle();
      return requests;
    }

    testWidgets('the menu is grouped by section, sold-out dishes flagged', (
      tester,
    ) async {
      await pump(
        tester,
        home: const MenuPage(),
        respond: (_) => _json(200, {
          'data': [
            dishJson(),
            dishJson(
              id: 'dish-2',
              name: 'Slap Chips',
              price: 25,
              category: 'Sides',
              available: false,
            ),
          ],
        }),
      );

      expect(find.text('Kotas'), findsOneWidget);
      expect(find.text('Sides'), findsOneWidget);
      expect(find.text('Full House Kota'), findsOneWidget);
      expect(
        find.text('1 dish is switched off. Customers cannot order it.'),
        findsOneWidget,
      );
    });

    testWidgets('an empty menu says why it matters', (tester) async {
      await pump(
        tester,
        home: const MenuPage(),
        respond: (_) => _json(200, {'data': <Object>[]}),
      );

      expect(find.text('Your menu is empty'), findsOneWidget);
    });

    testWidgets('switching a dish off asks the API and shows the result', (
      tester,
    ) async {
      final requests = await pump(
        tester,
        home: const MenuPage(),
        respond: (request) => request.method == 'PATCH'
            ? _json(200, {'data': dishJson(available: false)})
            : _json(200, {
                'data': [dishJson()],
              }),
      );

      await tester.tap(find.byType(Switch));
      await tester.pumpAndSettle();

      expect(requests.last.method, 'PATCH');
      expect(jsonDecode(requests.last.body), {'available': false});
      expect(
        find.text('1 dish is switched off. Customers cannot order it.'),
        findsOneWidget,
      );
    });

    testWidgets('a price typed with a comma is saved to the cent', (
      tester,
    ) async {
      final requests = await pump(
        tester,
        home: const MenuItemFormPage(),
        respond: (request) => request.method == 'POST'
            ? _json(201, {'data': dishJson()})
            : _json(200, {'data': <Object>[]}),
      );

      await tester.enterText(
        find.widgetWithText(TextFormField, 'Name'),
        'Full House Kota',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Price'),
        '45,50',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Section of the menu'),
        'Kotas',
      );
      await tester.tap(find.text('Add to menu'));
      await tester.pumpAndSettle();

      final post = requests.firstWhere((r) => r.method == 'POST');
      expect(post.url.path, '/api/v1/products');
      final body = jsonDecode(post.body) as Map<String, dynamic>;
      expect(body['price'], 45.5);
      expect(body['category'], 'Kotas');
    });

    testWidgets('a price the API would refuse never leaves the form', (
      tester,
    ) async {
      final requests = await pump(
        tester,
        home: const MenuItemFormPage(),
        respond: (_) => _json(200, {'data': <Object>[]}),
      );

      await tester.enterText(
        find.widgetWithText(TextFormField, 'Name'),
        'Kota',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Price'),
        '45.555',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Section of the menu'),
        'Kotas',
      );
      await tester.tap(find.text('Add to menu'));
      await tester.pumpAndSettle();

      expect(find.text('Enter a price, like 45,50.'), findsOneWidget);
      expect(requests.where((r) => r.method == 'POST'), isEmpty);
    });

    testWidgets('"Switch it off" in the remove dialog does not delete', (
      tester,
    ) async {
      final requests = await pump(
        tester,
        home: MenuItemFormPage(item: MenuItem.fromJson(dishJson())),
        respond: (request) => request.method == 'PATCH'
            ? _json(200, {'data': dishJson(available: false)})
            : _json(200, {
                'data': [dishJson()],
              }),
      );

      await tester.tap(find.byTooltip('Remove from the menu'));
      await tester.pumpAndSettle();

      expect(find.textContaining('switch it off'), findsOneWidget);

      await tester.tap(find.text('Switch it off'));
      await tester.pumpAndSettle();

      // The gentler option is what happened.
      expect(requests.where((r) => r.method == 'DELETE'), isEmpty);
      final patch = requests.firstWhere((r) => r.method == 'PATCH');
      expect(jsonDecode(patch.body), {'available': false});
    });

    testWidgets('"Remove" deletes the dish', (tester) async {
      final requests = await pump(
        tester,
        home: MenuItemFormPage(item: MenuItem.fromJson(dishJson())),
        respond: (request) => request.method == 'DELETE'
            ? http.Response('', 204)
            : _json(200, {
                'data': [dishJson()],
              }),
      );

      await tester.tap(find.byTooltip('Remove from the menu'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Remove'));
      await tester.pumpAndSettle();

      final delete = requests.firstWhere((r) => r.method == 'DELETE');
      expect(delete.url.path, '/api/v1/products/dish-1');
    });
  });
}
