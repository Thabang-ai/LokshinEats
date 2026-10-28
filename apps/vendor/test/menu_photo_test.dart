/// Putting a photograph on a dish.
///
/// The kitchen had no way to do this at all: Firebase Storage needs the
/// Blaze plan and the bucket does not exist, so the website's upload threw
/// and took the whole product submission with it, and the app never offered
/// one. These cover the app's half of the replacement - the picture goes up
/// as raw bytes, after the dish exists to attach it to.
library;

import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/config/app_config.dart';
import 'package:lokshineats_core/network/api_client.dart';
import 'package:lokshineats_core/providers.dart';

import 'package:lokshineats_vendor/features/menu/models/menu_item.dart';
import 'package:lokshineats_vendor/features/menu/pages/menu_item_form_page.dart';
import 'package:lokshineats_vendor/features/menu/providers/menu_providers.dart';

Map<String, Object?> dish({String id = 'prod-1', String? image}) => {
  'id': id,
  'storeId': 'store-1',
  'name': 'Full House Kota',
  'description': 'Everything in it.',
  'price': 45.5,
  'category': 'Kota',
  'available': true,
  'preparationTime': 20,
  'isVegetarian': false,
  'isSpicy': true,
  'image': image,
};

http.Response _json(Object? body, [int status = 200]) => http.Response(
  jsonEncode(body),
  status,
  headers: const {'content-type': 'application/json'},
);

/// Records what reached the API, so the upload can be checked rather than
/// assumed.
({List<http.Request> uploads, ApiClient client}) api({int uploadStatus = 200}) {
  final uploads = <http.Request>[];

  final client = ApiClient(
    httpClient: MockClient((request) async {
      if (request.url.path.endsWith('/image')) {
        uploads.add(request);

        if (uploadStatus != 200) {
          return _json({
            'error': {'code': 'bad_request', 'message': 'Too big.'},
          }, uploadStatus);
        }

        return _json({
          'data': dish(image: '/api/v1/products/prod-1/image?v=7'),
        });
      }

      return _json({'data': dish()}, request.method == 'POST' ? 201 : 200);
    }),
    baseUrl: 'http://api.test',
    tokenProvider: () async => 'test-id-token',
  );

  return (uploads: uploads, client: client);
}

Future<ProviderContainer> container(ApiClient client) async {
  final c = ProviderContainer(
    overrides: [
      apiClientProvider.overrideWithValue(client),
      isSignedInProvider.overrideWithValue(true),
    ],
  );
  addTearDown(c.dispose);
  return c;
}

void main() {
  group('the upload itself', () {
    test('goes up as raw bytes, not base64 in JSON', () async {
      // A photograph wrapped in base64 is a third larger, over mobile data
      // the kitchen pays for.
      final a = api();
      final c = await container(a.client);

      final bytes = Uint8List.fromList([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
      await c
          .read(menuProvider.notifier)
          .uploadPhoto('prod-1', bytes: bytes, contentType: 'image/jpeg');

      expect(a.uploads, hasLength(1));
      expect(a.uploads.single.method, 'PUT');
      expect(a.uploads.single.url.path, '/api/v1/products/prod-1/image');
      expect(a.uploads.single.headers['content-type'], 'image/jpeg');
      expect(a.uploads.single.bodyBytes, bytes);
    });

    test('a PNG is sent as a PNG', () async {
      final a = api();
      final c = await container(a.client);

      await c
          .read(menuProvider.notifier)
          .uploadPhoto(
            'prod-1',
            bytes: Uint8List.fromList([1, 2]),
            contentType: 'image/png',
          );

      expect(a.uploads.single.headers['content-type'], 'image/png');
    });

    test('the dish comes back pointing at its photo', () async {
      final a = api();
      final c = await container(a.client);

      final updated = await c
          .read(menuProvider.notifier)
          .uploadPhoto(
            'prod-1',
            bytes: Uint8List.fromList([1]),
            contentType: 'image/jpeg',
          );

      expect(updated.image, '/api/v1/products/prod-1/image?v=7');
      // Resolved against the API this build was compiled against - not the
      // website, which is where every other stored path points.
      expect(
        updated.photoUrl,
        '${AppConfig.apiBaseUrl}/api/v1/products/prod-1/image?v=7',
      );
    });
  });

  group('the form', () {
    testWidgets('offers both a camera and the gallery', (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);

      final a = api();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            apiClientProvider.overrideWithValue(a.client),
            isSignedInProvider.overrideWithValue(true),
          ],
          child: MaterialApp(
            home: MenuItemFormPage(
              item: MenuItem.fromJson(dish() as Map<String, dynamic>),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Take a photo'), findsOneWidget);
      expect(find.text('Choose one'), findsOneWidget);
      expect(find.text('No photo yet'), findsOneWidget);
    });

    testWidgets('a dish that has one says so instead', (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);

      final a = api();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            apiClientProvider.overrideWithValue(a.client),
            isSignedInProvider.overrideWithValue(true),
          ],
          child: MaterialApp(
            home: MenuItemFormPage(
              item: MenuItem.fromJson(
                dish(image: '/api/v1/products/prod-1/image?v=7')
                    as Map<String, dynamic>,
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('No photo yet'), findsNothing);
      expect(find.byType(Image), findsWidgets);
    });
  });
}
