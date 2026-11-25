/// Being told where a kitchen will not deliver.
///
/// A customer in Tembisa could browse a kitchen in Meadowlands, build a
/// basket, fill in an address and only then be refused - the same mistake the
/// closed-kitchen message used to make. The answer is the same: say it on the
/// card, say it on the kitchen's page, and let the address field catch it.
///
/// A customer who has not told us where they live is never warned off
/// anything on a guess.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:firebase_auth/firebase_auth.dart' show User;

import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/auth/user_profile.dart';
import 'package:lokshineats_core/theme/app_theme.dart';
import 'package:lokshineats_customer/features/stores/models/product.dart';
import 'package:lokshineats_customer/features/stores/models/store.dart';
import 'package:lokshineats_customer/features/stores/pages/store_detail_page.dart';
import 'package:lokshineats_customer/features/stores/pages/stores_page.dart';
import 'package:lokshineats_customer/features/stores/providers/store_providers.dart';
import 'package:lokshineats_customer/features/stores/repositories/store_repository.dart';

Store buildStore({List<String> deliveryAreas = const []}) => Store(
  id: 'store-1',
  name: 'Mama Ntuli Kota Corner',
  description: 'Township favourites, made fresh.',
  cuisine: 'Kota Specialist',
  address: '12 Khozi Street',
  city: 'Meadowlands',
  categories: const ['Kota'],
  image: '🍔',
  rating: 4.6,
  reviewCount: 32,
  deliveryTime: '30-45 min',
  deliveryFee: 12,
  minOrderAmount: 30,
  isOpen: true,
  deliveryAreas: deliveryAreas,
);

UserProfile profileIn(String? city) => UserProfile(
  id: 'cust-1',
  email: 'thandi@example.com',
  displayName: 'Thandi',
  phone: '0821234567',
  address: city == null
      ? null
      : ProfileAddress(street: '1 Main Road', city: city, postalCode: '1804'),
  role: 'customer',
);

class FakeStores implements StoreRepository {
  FakeStores(this.store);

  final Store store;

  /// The area the app asked the API to narrow to, as it asked for it.
  String? askedFor;
  bool asked = false;

  @override
  Future<List<Store>> fetchStores({
    String? city,
    String? cuisine,
    String? deliversTo,
    bool openOnly = false,
    int limit = 20,
    String? cursor,
  }) async {
    askedFor = deliversTo;
    asked = true;
    // The real API filters on this; a fake that ignored it would let a
    // broken query pass the test.
    return deliversTo == null || store.deliversTo(deliversTo) ? [store] : [];
  }

  @override
  Future<Store> fetchStore(String storeId) async => store;

  @override
  Future<List<Product>> fetchMenu(
    String storeId, {
    bool availableOnly = true,
    int limit = 100,
  }) async => const [];
}

Future<FakeStores> pump(
  WidgetTester tester, {
  required Store store,
  required UserProfile? profile,
  bool detail = false,
}) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  final repository = FakeStores(store);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        storeRepositoryProvider.overrideWithValue(repository),
        firebaseUserProvider.overrideWith((ref) => Stream<User?>.value(null)),
        // Signed in, with a profile: the only state in which the app knows
        // where this customer lives.
        isSignedInProvider.overrideWithValue(true),
        profileProvider.overrideWith((ref) async => profile),
      ],
      child: MaterialApp(
        theme: AppTheme.light,
        home: detail
            ? const StoreDetailPage(storeId: 'store-1')
            : const StoresPage(),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return repository;
}

final pill = find.text('Does not deliver to you');

void main() {
  group('reading what the API sends', () {
    // The field name is the seam that has bitten this project before - the
    // customer app read `deliveryOTP` for months while orders carried
    // `deliveryCode`. This parses the serialiser's actual shape.
    test('picks up the areas and the strings in them', () {
      final store = Store.fromJson(const {
        'id': 'store-1',
        'name': 'Mama Ntuli Kota Corner',
        'city': 'Meadowlands',
        'isOpen': true,
        'deliveryAreas': ['Meadowlands', 'Dobsonville'],
      });

      expect(store.deliveryAreas, ['Meadowlands', 'Dobsonville']);
      expect(store.deliversTo('dobsonville'), isTrue);
      expect(store.deliversTo('Tembisa'), isFalse);
    });

    test('a kitchen the API sends no areas for delivers anywhere', () {
      final store = Store.fromJson(const {
        'id': 'store-1',
        'name': 'Mama Ntuli Kota Corner',
        'isOpen': true,
      });

      expect(store.hasDeliveryAreas, isFalse);
      expect(store.deliversTo('Tembisa'), isTrue);
    });
  });

  group('browsing', () {
    testWidgets('leaves out a kitchen that will not come to you', (
      tester,
    ) async {
      final repository = await pump(
        tester,
        store: buildStore(deliveryAreas: ['Meadowlands', 'Dobsonville']),
        profile: profileIn('Tembisa'),
      );

      // Asked of the API rather than filtered afterwards, so a customer in
      // Tembisa is not shown a kitchen they cannot order from at all.
      expect(repository.askedFor, 'Tembisa');
      expect(find.text('Mama Ntuli Kota Corner'), findsNothing);
      expect(find.text('Nobody delivers to Tembisa yet'), findsOneWidget);
    });

    testWidgets('keeps one that will', (tester) async {
      final repository = await pump(
        tester,
        store: buildStore(deliveryAreas: ['Meadowlands', 'Tembisa']),
        profile: profileIn('tembisa '),
      );

      expect(repository.askedFor, 'tembisa');
      expect(find.text('Mama Ntuli Kota Corner'), findsOneWidget);
      expect(pill, findsNothing);
    });

    testWidgets('keeps a kitchen with no areas set', (tester) async {
      // Every kitchen on the platform, until a vendor draws the line.
      final repository = await pump(
        tester,
        store: buildStore(),
        profile: profileIn('Tembisa'),
      );

      expect(repository.askedFor, 'Tembisa');
      expect(find.text('Mama Ntuli Kota Corner'), findsOneWidget);
    });

    testWidgets('asks for everything when it does not know where you are', (
      tester,
    ) async {
      final repository = await pump(
        tester,
        store: buildStore(deliveryAreas: ['Meadowlands']),
        profile: profileIn(null),
      );

      expect(repository.asked, isTrue);
      expect(repository.askedFor, isNull);
      // Nothing is hidden from a customer the app knows nothing about, and
      // nothing is claimed about them either.
      expect(find.text('Mama Ntuli Kota Corner'), findsOneWidget);
      expect(pill, findsNothing);
      expect(find.textContaining('Delivers to'), findsNothing);
    });

    testWidgets('the filter can be turned off, and then says so on the card', (
      tester,
    ) async {
      // A saved address can be out of date, and somebody can be ordering for
      // an address somewhere else.
      await pump(
        tester,
        store: buildStore(deliveryAreas: ['Meadowlands', 'Dobsonville']),
        profile: profileIn('Tembisa'),
      );

      await tester.tap(find.text('Delivers to Tembisa'));
      await tester.pumpAndSettle();

      expect(find.text('Mama Ntuli Kota Corner'), findsOneWidget);
      expect(pill, findsOneWidget);
    });
  });

  group('the kitchen’s own page', () {
    testWidgets('says where it does deliver', (tester) async {
      await pump(
        tester,
        store: buildStore(deliveryAreas: ['Meadowlands', 'Dobsonville']),
        profile: profileIn('Tembisa'),
        detail: true,
      );

      expect(
        find.text(
          'They do not deliver to Tembisa. They deliver to Meadowlands and '
          'Dobsonville.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('and stays quiet for a customer it can reach', (tester) async {
      await pump(
        tester,
        store: buildStore(deliveryAreas: ['Meadowlands']),
        profile: profileIn('Meadowlands'),
        detail: true,
      );

      expect(find.textContaining('do not deliver'), findsNothing);
    });
  });
}
