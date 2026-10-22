/// Favouriting a kitchen.
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

import 'package:lokshineats_customer/features/favourites/providers/favourites_providers.dart';
import 'package:lokshineats_customer/features/favourites/widgets/favourite_button.dart';

http.Response _json(int status, Object body) => http.Response(
  jsonEncode(body),
  status,
  headers: {'content-type': 'application/json'},
);

/// An API that records what it was asked and answers as told.
({List<http.Request> requests, ApiClient client}) api({
  List<String> initial = const [],
  bool failWrites = false,
}) {
  final requests = <http.Request>[];
  var saved = [...initial];

  final client = ApiClient(
    httpClient: MockClient((request) async {
      requests.add(request);
      final isWrite = request.method != 'GET';

      if (isWrite && failWrites) return _json(500, {'error': 'nope'});

      if (request.method == 'PUT') {
        final id = request.url.pathSegments.last;
        if (!saved.contains(id)) saved.add(id);
      } else if (request.method == 'DELETE') {
        saved.remove(request.url.pathSegments.last);
        return http.Response('', 204);
      }

      return _json(200, {'data': saved});
    }),
    baseUrl: 'http://api.test',
    tokenProvider: () async => 'test-id-token',
  );

  return (requests: requests, client: client);
}

ProviderContainer containerFor(ApiClient client, {bool signedIn = true}) {
  final container = ProviderContainer(
    overrides: [
      apiClientProvider.overrideWithValue(client),
      isSignedInProvider.overrideWithValue(signedIn),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

void main() {
  group('the list', () {
    test('a signed-out browser has none, and nothing is asked of the API', () async {
      final a = api();
      final container = containerFor(a.client, signedIn: false);

      expect(await container.read(favouritesProvider.future), isEmpty);
      expect(a.requests, isEmpty);
    });

    test('a signed-in customer gets what they saved', () async {
      final a = api(initial: ['kasi-kota']);
      final container = containerFor(a.client);

      expect(await container.read(favouritesProvider.future), {'kasi-kota'});
    });
  });

  group('tapping the heart', () {
    test('saves, and keeps the list the API answers with', () async {
      final a = api();
      final container = containerFor(a.client);
      await container.read(favouritesProvider.future);

      await container.read(favouritesProvider.notifier).toggle('kasi-kota');

      expect(container.read(favouritesProvider).value, {'kasi-kota'});
      expect(
        a.requests.map((r) => '${r.method} ${r.url.path}').toList(),
        contains('PUT /api/v1/users/me/favorites/kasi-kota'),
      );
    });

    test('removes one that was saved', () async {
      final a = api(initial: ['kasi-kota']);
      final container = containerFor(a.client);
      await container.read(favouritesProvider.future);

      await container.read(favouritesProvider.notifier).toggle('kasi-kota');

      expect(container.read(favouritesProvider).value, isEmpty);
      expect(
        a.requests.map((r) => '${r.method} ${r.url.path}').toList(),
        contains('DELETE /api/v1/users/me/favorites/kasi-kota'),
      );
    });

    test('a failure puts the heart back, and says so by throwing', () async {
      final a = api(failWrites: true);
      final container = containerFor(a.client);
      await container.read(favouritesProvider.future);

      await expectLater(
        container.read(favouritesProvider.notifier).toggle('kasi-kota'),
        throwsA(anything),
      );

      // The optimistic heart must not survive a failed save, or the customer
      // is told something was kept that was not.
      expect(container.read(favouritesProvider).value, isEmpty);
    });
  });

  group('the heart itself', () {
    Future<void> pump(WidgetTester tester, {required bool signedIn}) async {
      final a = api();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            apiClientProvider.overrideWithValue(a.client),
            isSignedInProvider.overrideWithValue(signedIn),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: FavouriteButton(storeId: 'kasi-kota', storeName: 'Kasi Kota'),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    testWidgets('is offered to a signed-in customer', (tester) async {
      await pump(tester, signedIn: true);
      expect(find.byIcon(Icons.favorite_border_rounded), findsOneWidget);
    });

    testWidgets('is hidden from a signed-out browser', (tester) async {
      // There is nowhere to save it, and a heart that does nothing is worse
      // than no heart.
      await pump(tester, signedIn: false);
      expect(find.byIcon(Icons.favorite_border_rounded), findsNothing);
    });

    testWidgets('fills when tapped', (tester) async {
      await pump(tester, signedIn: true);

      await tester.tap(find.byIcon(Icons.favorite_border_rounded));
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.favorite_rounded), findsOneWidget);
    });
  });
}
