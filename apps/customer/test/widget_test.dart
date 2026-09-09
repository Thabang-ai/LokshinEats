/// Widget tests for the browse screen.
///
/// The repository is overridden with a fake, so these exercise the wiring —
/// providers, async states, rendering — without a network. What is being
/// checked is that each of the three states a screen can be in actually
/// reaches the customer, since a forgotten error branch is invisible until it
/// happens to someone.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:firebase_auth/firebase_auth.dart' show User;

import 'package:lokshineats_customer/core/network/api_exception.dart';
import 'package:lokshineats_customer/core/theme/app_theme.dart';
import 'package:lokshineats_customer/features/auth/providers/auth_providers.dart';
import 'package:lokshineats_customer/features/stores/models/product.dart';
import 'package:lokshineats_customer/features/stores/models/store.dart';
import 'package:lokshineats_customer/features/stores/pages/stores_page.dart';
import 'package:lokshineats_customer/features/stores/providers/store_providers.dart';
import 'package:lokshineats_customer/features/stores/repositories/store_repository.dart';

Store buildStore({
  String id = 'store-1',
  String name = 'Mama Ntuli Kota Corner',
  bool isOpen = true,
  double rating = 4.6,
  int reviewCount = 32,
}) {
  return Store(
    id: id,
    name: name,
    description: 'Township favourites, made fresh.',
    cuisine: 'Kota Specialist',
    address: '12 Vilakazi Street',
    city: 'Soweto',
    categories: const ['Kota'],
    image: '🍔',
    rating: rating,
    reviewCount: reviewCount,
    deliveryTime: '30-45 min',
    deliveryFee: 20,
    minOrderAmount: 30,
    isOpen: isOpen,
  );
}

/// Returns whatever it is told to, including a failure.
class FakeStoreRepository implements StoreRepository {
  FakeStoreRepository({this.stores = const [], this.error});

  final List<Store> stores;
  final Object? error;

  @override
  Future<List<Store>> fetchStores({
    String? city,
    String? cuisine,
    bool openOnly = false,
    int limit = 20,
    String? cursor,
  }) async {
    if (error != null) throw error!;
    return openOnly ? stores.where((s) => s.isOpen).toList() : stores;
  }

  @override
  Future<Store> fetchStore(String storeId) async =>
      stores.firstWhere((s) => s.id == storeId);

  @override
  Future<List<Product>> fetchMenu(
    String storeId, {
    bool availableOnly = true,
    int limit = 100,
  }) async => const [];
}

Widget wrap(StoreRepository repository) {
  return ProviderScope(
    overrides: [
      storeRepositoryProvider.overrideWithValue(repository),
      // The browse screen shows account state, which would otherwise reach
      // for FirebaseAuth.instance — uninitialised in a test. Signed out is
      // the state these tests are about anyway.
      firebaseUserProvider.overrideWith((ref) => Stream<User?>.value(null)),
    ],
    child: MaterialApp(theme: AppTheme.light, home: const StoresPage()),
  );
}

void main() {
  testWidgets('shows kitchens returned by the API', (tester) async {
    await tester.pumpWidget(
      wrap(FakeStoreRepository(stores: [buildStore()])),
    );
    await tester.pumpAndSettle();

    expect(find.text('Mama Ntuli Kota Corner'), findsOneWidget);
    expect(find.text('Kota Specialist'), findsOneWidget);
    // Delivery fee is shown without trailing zeros when it is a whole number.
    expect(find.textContaining('R20 delivery'), findsOneWidget);
  });

  testWidgets('marks a closed kitchen rather than hiding it', (tester) async {
    await tester.pumpWidget(
      wrap(FakeStoreRepository(stores: [buildStore(isOpen: false)])),
    );
    await tester.pumpAndSettle();

    // A customer looking for a specific kitchen should find it and see that
    // it is shut, not conclude it no longer exists.
    expect(find.text('Mama Ntuli Kota Corner'), findsOneWidget);
    expect(find.text('Closed'), findsOneWidget);
  });

  testWidgets('shows the API message when the request fails', (tester) async {
    await tester.pumpWidget(
      wrap(
        FakeStoreRepository(
          error: ApiException(
            code: ApiErrorCode.internal,
            status: 500,
            message: 'Something went wrong. Please try again.',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Something went wrong. Please try again.'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
  });

  testWidgets('offers no retry for a failure retrying cannot fix', (
    tester,
  ) async {
    await tester.pumpWidget(
      wrap(
        FakeStoreRepository(
          error: ApiException(
            code: ApiErrorCode.notFound,
            status: 404,
            message: 'No such store.',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('No such store.'), findsOneWidget);
    expect(find.text('Try again'), findsNothing);
  });

  testWidgets('says so when there are no kitchens', (tester) async {
    await tester.pumpWidget(wrap(FakeStoreRepository()));
    await tester.pumpAndSettle();

    expect(find.text('No kitchens found'), findsOneWidget);
  });

  testWidgets('filters the list as the customer types', (tester) async {
    await tester.pumpWidget(
      wrap(
        FakeStoreRepository(
          stores: [
            buildStore(name: 'Mama Ntuli Kota Corner'),
            buildStore(id: 'store-2', name: 'Soweto Braai House'),
          ],
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Soweto Braai House'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'ntuli');
    await tester.pumpAndSettle();

    expect(find.text('Mama Ntuli Kota Corner'), findsOneWidget);
    expect(find.text('Soweto Braai House'), findsNothing);
  });
}
