/// Opening hours that do something, and the switch beside them.
///
/// The hours have been on the registration form since the first day and have
/// never closed a kitchen. Turning them on is the vendor's own choice, which
/// is why the editor asks rather than assumes - and why a kitchen that has
/// never touched them keeps working exactly as before.
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
import 'package:lokshineats_vendor/features/store/pages/edit_store_page.dart';
import 'package:lokshineats_vendor/features/store/providers/store_providers.dart';
import 'package:lokshineats_vendor/features/store/repositories/store_repository.dart';

Map<String, Object?> storeJson({
  bool isOpen = true,
  bool switchedOn = true,
  String hoursMode = 'manual',
  String? openingTime,
  String? closingTime,
}) => {
  'id': 'store-1',
  'name': "Mini's Mashy Eatery",
  'cuisine': 'Traditional Township Food',
  'address': '12 Khozi Street',
  'city': 'Meadowlands',
  'isOpen': isOpen,
  'switchedOn': switchedOn,
  'hoursMode': hoursMode,
  'openingTime': ?openingTime,
  'closingTime': ?closingTime,
  'deliveryFee': 12.0,
  'minOrderAmount': 30.0,
  'deliveryTime': '30-45 min',
  'verification': 'approved',
};

late List<Map<String, Object?>> patches;

/// Records what the app asks the API to change, and answers with the kitchen
/// as it would be afterwards.
ApiClient _api(Map<String, Object?> base) => ApiClient(
  httpClient: MockClient((request) async {
    var body = base;
    if (request.method == 'PATCH') {
      final changes = jsonDecode(request.body) as Map<String, Object?>;
      patches.add(changes);
      body = {...base, ...changes};
    }
    return http.Response(
      jsonEncode({'data': body}),
      200,
      headers: const {'content-type': 'application/json'},
    );
  }),
  baseUrl: 'http://api.test',
  tokenProvider: () async => 'test-id-token',
);

class _FixedStore extends MyStoreNotifier {
  _FixedStore(this.store);

  final Store store;

  @override
  Future<Store?> build() async => store;
}

Future<void> pumpHome(WidgetTester tester, Map<String, Object?> json) async {
  patches = [];
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  final client = _api(json);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(client),
        isSignedInProvider.overrideWithValue(true),
        needsProfileProvider.overrideWithValue(false),
        // The real repository reaches Firebase for a fresh token, which no
        // widget test can do.
        storeRepositoryProvider.overrideWith(
          (ref) => StoreRepository(client, () async {}),
        ),
        myStoreProvider.overrideWith(
          () => _FixedStore(Store.fromJson(json as Map<String, dynamic>)),
        ),
      ],
      child: const MaterialApp(home: VendorHomePage()),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> pumpEditor(WidgetTester tester, Map<String, Object?> json) async {
  patches = [];
  tester.view.physicalSize = const Size(1080, 9000);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  final store = Store.fromJson(json as Map<String, dynamic>);
  final client = _api(json);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(client),
        isSignedInProvider.overrideWithValue(true),
        storeRepositoryProvider.overrideWith(
          (ref) => StoreRepository(client, () async {}),
        ),
        myStoreProvider.overrideWith(() => _FixedStore(store)),
      ],
      child: MaterialApp(home: EditStorePage(store: store)),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  group('the switch beside the queue', () {
    testWidgets('shows the vendor their own setting, not the answer', (
      tester,
    ) async {
      // Switched on, but the clock has closed it. A switch that flicked
      // itself off at closing time would look broken.
      await pumpHome(
        tester,
        storeJson(
          isOpen: false,
          switchedOn: true,
          hoursMode: 'scheduled',
          openingTime: '08:00',
          closingTime: '18:00',
        ),
      );

      expect(tester.widget<Switch>(find.byType(Switch)).value, isTrue);
      expect(find.text('Shut for now'), findsOneWidget);
    });

    testWidgets('says Open when customers can actually order', (tester) async {
      await pumpHome(tester, storeJson());

      expect(find.text('Open'), findsOneWidget);
    });

    testWidgets('says Closed when the vendor closed it', (tester) async {
      await pumpHome(tester, storeJson(isOpen: false, switchedOn: false));

      expect(find.text('Closed'), findsOneWidget);
      expect(find.text('Shut for now'), findsNothing);
    });
  });

  group('the hours editor', () {
    testWidgets('is off for a kitchen that never asked for it', (tester) async {
      await pumpEditor(tester, storeJson());

      expect(
        tester
            .widget<SwitchListTile>(
              find.widgetWithText(
                SwitchListTile,
                'Open and close automatically',
              ),
            )
            .value,
        isFalse,
      );
    });

    testWidgets('sends the hours and the mode when it is turned on', (
      tester,
    ) async {
      await pumpEditor(tester, storeJson());

      await tester.tap(
        find.widgetWithText(SwitchListTile, 'Open and close automatically'),
      );
      await tester.pump();
      await tester.enterText(
        find.widgetWithText(TextFormField, '08:00'),
        '09:00',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, '20:00'),
        '21:30',
      );
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();

      expect(patches.single, {
        'openingTime': '09:00',
        'closingTime': '21:30',
        'hoursMode': 'scheduled',
      });
    });

    testWidgets('will not schedule a kitchen with no hours', (tester) async {
      // Blank hours under a schedule would mean "never closed", which is
      // not what anybody ticking that box means.
      await pumpEditor(tester, storeJson());

      await tester.tap(
        find.widgetWithText(SwitchListTile, 'Open and close automatically'),
      );
      await tester.pump();
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();

      expect(find.text('Give a time, or turn this off.'), findsWidgets);
      expect(patches, isEmpty);
    });

    testWidgets('refuses a time that is not a time', (tester) async {
      await pumpEditor(tester, storeJson());

      await tester.enterText(
        find.widgetWithText(TextFormField, '08:00'),
        'morning',
      );
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();

      expect(find.text('Use 24-hour time, like 08:00.'), findsOneWidget);
      expect(patches, isEmpty);
    });
  });
}
