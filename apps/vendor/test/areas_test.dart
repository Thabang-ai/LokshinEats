/// Where a kitchen says it delivers.
///
/// A kitchen in Meadowlands could be ordered from in Tembisa, 40km away: the
/// order went through, the food was cooked, and somebody had to phone the
/// customer. Drawing the line is the vendor's own choice - a kitchen that has
/// not drawn one keeps delivering anywhere, which is every kitchen trading
/// today.
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
  String city = 'Meadowlands',
  List<String> deliveryAreas = const [],
}) => {
  'id': 'store-1',
  'name': "Mini's Mashy Eatery",
  'cuisine': 'Traditional Township Food',
  'address': '12 Khozi Street',
  'city': city,
  'isOpen': true,
  'switchedOn': true,
  'hoursMode': 'manual',
  'deliveryFee': 12.0,
  'minOrderAmount': 30.0,
  'deliveryTime': '30-45 min',
  'verification': 'approved',
  'deliveryAreas': deliveryAreas,
};

late List<Map<String, Object?>> patches;

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

Future<void> pumpEditor(WidgetTester tester, Map<String, Object?> json) async {
  patches = [];
  tester.view.physicalSize = const Size(1080, 12000);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  final store = Store.fromJson(json as Map<String, dynamic>);
  final client = _api(json);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(client),
        isSignedInProvider.overrideWithValue(true),
        // The real one refreshes a Firebase token, which no widget test can.
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

final limitSwitch = find.widgetWithText(
  SwitchListTile,
  'Only deliver to certain areas',
);

Future<void> save(WidgetTester tester) async {
  await tester.tap(find.text('Save'));
  await tester.pumpAndSettle();
}

Future<void> addArea(WidgetTester tester, String name) async {
  await tester.enterText(find.widgetWithText(TextField, 'Add an area'), name);
  await tester.tap(find.byTooltip('Add this area'));
  await tester.pump();
}

void main() {
  testWidgets('a kitchen with no areas delivers anywhere', (tester) async {
    await pumpEditor(tester, storeJson());

    expect(tester.widget<SwitchListTile>(limitSwitch).value, isFalse);
    expect(
      find.text('Anyone can order from you, however far away they are.'),
      findsOneWidget,
    );
    expect(find.widgetWithText(TextField, 'Add an area'), findsNothing);
  });

  testWidgets('drawing a line starts with the kitchen’s own township', (
    tester,
  ) async {
    // A vendor who has to type their own area first will get it wrong, and
    // the API would add it back anyway.
    await pumpEditor(tester, storeJson());

    await tester.tap(limitSwitch);
    await tester.pumpAndSettle();

    expect(find.widgetWithText(Chip, 'Meadowlands'), findsOneWidget);
  });

  testWidgets('their own township cannot be removed', (tester) async {
    await pumpEditor(
      tester,
      storeJson(deliveryAreas: ['Meadowlands', 'Dobsonville']),
    );

    // The removable ones carry a delete button; the home township does not.
    expect(find.byType(InputChip), findsOneWidget);
    expect(find.widgetWithText(InputChip, 'Dobsonville'), findsOneWidget);
  });

  testWidgets('sends the areas it was given', (tester) async {
    await pumpEditor(tester, storeJson(deliveryAreas: ['Meadowlands']));

    await addArea(tester, 'Dobsonville');
    await save(tester);

    expect(patches.single, {
      'deliveryAreas': ['Meadowlands', 'Dobsonville'],
    });
  });

  testWidgets('drops an area the vendor typed twice', (tester) async {
    await pumpEditor(tester, storeJson(deliveryAreas: ['Meadowlands']));

    await addArea(tester, 'Dobsonville');
    await addArea(tester, ' dobsonville ');
    await save(tester);

    expect(patches.single, {
      'deliveryAreas': ['Meadowlands', 'Dobsonville'],
    });
  });

  testWidgets('removing an area sends the shorter list', (tester) async {
    await pumpEditor(
      tester,
      storeJson(deliveryAreas: ['Meadowlands', 'Dobsonville']),
    );

    await tester.tap(find.byTooltip('Stop delivering to Dobsonville'));
    await tester.pumpAndSettle();
    await save(tester);

    expect(patches.single, {
      'deliveryAreas': ['Meadowlands'],
    });
  });

  testWidgets('lifting the limit sends an empty list, not nothing', (
    tester,
  ) async {
    // Sending nothing would leave the old areas in place. An empty list is
    // the instruction: deliver anywhere again.
    await pumpEditor(tester, storeJson(deliveryAreas: ['Dobsonville']));

    await tester.tap(limitSwitch);
    await tester.pumpAndSettle();
    await save(tester);

    expect(patches.single, {'deliveryAreas': <String>[]});
  });

  testWidgets('will not save a limit with nothing in it', (tester) async {
    // Only reachable for a kitchen with no city on it, but "deliver
    // nowhere" is not what switching this on means.
    await pumpEditor(tester, storeJson(city: ''));

    await tester.tap(limitSwitch);
    await tester.pumpAndSettle();
    await save(tester);

    expect(find.text('Name at least one area.'), findsOneWidget);
    expect(patches, isEmpty);
  });

  testWidgets('changing nothing sends nothing about areas', (tester) async {
    await pumpEditor(tester, storeJson(deliveryAreas: ['Meadowlands']));

    await save(tester);

    // The screen always sends a patch; the point is that it says nothing
    // about areas.
    expect(patches.single.containsKey('deliveryAreas'), isFalse);
  });
}
