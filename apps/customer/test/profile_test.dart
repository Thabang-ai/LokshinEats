/// Tests for profile editing.
///
/// The address tests exist because the API and the web app used to disagree
/// about what an address is — so the thing checked here is the exact shape
/// that crosses the wire, and that the form will not send a half address the
/// API would reject.
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:lokshineats_core/network/api_client.dart';
import 'package:lokshineats_core/providers.dart';
import 'package:lokshineats_core/theme/app_theme.dart';
import 'package:lokshineats_core/auth/user_profile.dart';
import 'package:lokshineats_customer/features/auth/pages/edit_profile_page.dart';
import 'package:lokshineats_core/auth/profile_repository.dart';

const _address = ProfileAddress(
  street: '88 Ndaba Street',
  city: 'Meadowlands',
  postalCode: '1852',
);

const _profile = UserProfile(
  id: 'cust-1',
  email: 'thabo@lokshin.test',
  displayName: 'Thabo Nkosi',
  phone: '0821234567',
  address: _address,
  role: 'customer',
);

Map<String, dynamic> _profileJson({Object? address}) => {
  'id': 'cust-1',
  'email': 'thabo@lokshin.test',
  'displayName': 'Thabo Nkosi',
  'phone': '0821234567',
  'address': address,
  'role': 'customer',
};

http.Response _json(int status, Object body) => http.Response(
  jsonEncode(body),
  status,
  headers: {'content-type': 'application/json'},
);

ApiClient _client(http.Client http) => ApiClient(
  httpClient: http,
  baseUrl: 'http://api.test',
  tokenProvider: () async => 'test-id-token',
);

void main() {
  group('address model', () {
    test('reads the structured shape the API returns', () {
      final address = ProfileAddress.fromJson(const {
        'street': ' 88 Ndaba Street ',
        'city': 'Meadowlands',
        'postalCode': '1852',
      });

      expect(address?.street, '88 Ndaba Street');
      expect(address?.oneLine, '88 Ndaba Street, Meadowlands, 1852');
      expect(address?.isComplete, isTrue);
    });

    test('an old single-line address the API passes on keeps its street', () {
      // The API reads a legacy string as the street with no city or postal
      // code, so the account page can still show what was saved.
      final address = ProfileAddress.fromJson(const {
        'street': '12 Vilakazi Street, Soweto',
        'city': '',
        'postalCode': '',
      });

      expect(address?.oneLine, '12 Vilakazi Street, Soweto');
      expect(address?.isComplete, isFalse);
    });

    test('no address, a blank one, or junk reads as none', () {
      expect(ProfileAddress.fromJson(null), isNull);
      expect(
        ProfileAddress.fromJson(const {'street': '', 'city': '', 'postalCode': ''}),
        isNull,
      );
      expect(ProfileAddress.fromJson('12 Vilakazi Street'), isNull);
    });

    test('a profile carries its address', () {
      final profile = UserProfile.fromJson(
        _profileJson(address: _address.toJson()),
      );

      expect(profile.address?.city, 'Meadowlands');
    });
  });

  group('saving', () {
    test('sends every field, with the address as an object', () async {
      Map<String, dynamic>? sent;
      String? method;

      final repository = ProfileRepository(
        _client(
          MockClient((request) async {
            method = request.method;
            sent = jsonDecode(request.body) as Map<String, dynamic>;
            return _json(200, {'data': _profileJson(address: _address.toJson())});
          }),
        ),
      );

      await repository.updateMe(
        displayName: ' Thabo Nkosi ',
        phone: '082 123 4567',
        address: _address,
      );

      expect(method, 'PATCH');
      expect(sent, {
        'displayName': 'Thabo Nkosi',
        'phone': '0821234567',
        'address': {
          'street': '88 Ndaba Street',
          'city': 'Meadowlands',
          'postalCode': '1852',
        },
      });
      // Role is the API's to decide; it must never be in this request.
      expect(sent!.containsKey('role'), isFalse);
    });

    test('a cleared address is sent as null, not left out', () async {
      Map<String, dynamic>? sent;

      final repository = ProfileRepository(
        _client(
          MockClient((request) async {
            sent = jsonDecode(request.body) as Map<String, dynamic>;
            return _json(200, {'data': _profileJson()});
          }),
        ),
      );

      await repository.updateMe(
        displayName: 'Thabo Nkosi',
        phone: '0821234567',
        address: null,
      );

      // Leaving the key out would keep the old address on the server.
      expect(sent!.containsKey('address'), isTrue);
      expect(sent!['address'], isNull);
    });
  });

  group('edit form', () {
    Future<List<Map<String, dynamic>>> pumpForm(
      WidgetTester tester, {
      UserProfile profile = _profile,
    }) async {
      final requests = <Map<String, dynamic>>[];

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            apiClientProvider.overrideWithValue(
              _client(
                MockClient((request) async {
                  requests.add(jsonDecode(request.body) as Map<String, dynamic>);
                  return _json(200, {'data': _profileJson()});
                }),
              ),
            ),
          ],
          child: MaterialApp(
            theme: AppTheme.light,
            home: EditProfilePage(profile: profile),
          ),
        ),
      );
      await tester.pump();
      return requests;
    }

    Finder field(String label) => find.widgetWithText(TextFormField, label);

    testWidgets('starts filled in with the saved profile', (tester) async {
      await pumpForm(tester);

      expect(find.text('Thabo Nkosi'), findsOneWidget);
      expect(find.text('88 Ndaba Street'), findsOneWidget);
      expect(find.text('Meadowlands'), findsOneWidget);
      expect(find.text('1852'), findsOneWidget);
    });

    testWidgets('will not send half an address', (tester) async {
      const noAddress = UserProfile(
        id: 'cust-1',
        email: 'thabo@lokshin.test',
        displayName: 'Thabo Nkosi',
        phone: '0821234567',
        address: null,
        role: 'customer',
      );
      final requests = await pumpForm(tester, profile: noAddress);

      await tester.enterText(field('Street address'), '88 Ndaba Street');
      await tester.ensureVisible(find.text('Save changes'));
      await tester.tap(find.text('Save changes'));
      await tester.pump();

      expect(find.text('Add your town or city.'), findsOneWidget);
      expect(find.text('Four digits.'), findsOneWidget);
      expect(requests, isEmpty);
    });

    testWidgets('clearing the address saves it as removed', (tester) async {
      final requests = await pumpForm(tester);

      await tester.tap(find.text('Clear'));
      await tester.pump();
      await tester.ensureVisible(find.text('Save changes'));
      await tester.tap(find.text('Save changes'));
      await tester.pumpAndSettle();

      expect(requests, hasLength(1));
      expect(requests.single.containsKey('address'), isTrue);
      expect(requests.single['address'], isNull);
    });

    testWidgets('an API rejection shows the API\'s own field message', (
      tester,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            apiClientProvider.overrideWithValue(
              _client(
                MockClient((request) async {
                  return _json(422, {
                    'error': {
                      'code': 'validation_failed',
                      'message': 'Some fields are not valid.',
                      'details': {
                        'phone': 'Enter a valid South African mobile number.',
                      },
                    },
                  });
                }),
              ),
            ),
          ],
          child: MaterialApp(
            theme: AppTheme.light,
            home: const EditProfilePage(profile: _profile),
          ),
        ),
      );
      await tester.pump();

      await tester.ensureVisible(find.text('Save changes'));
      await tester.tap(find.text('Save changes'));
      await tester.pumpAndSettle();

      expect(
        find.text('Enter a valid South African mobile number.'),
        findsOneWidget,
      );
      // Still on the form, so nothing typed is lost.
      expect(find.text('Save changes'), findsOneWidget);
    });
  });
}
