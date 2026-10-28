/// Whether the kitchen can see if the driver has paid it.
///
/// A delivered cash order used to say one word - "Delivered." - whether the
/// driver had handed over the money, was waiting to be confirmed, or had not
/// paid at all. The kitchen had nowhere to look.
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

import 'package:lokshineats_vendor/features/orders/pages/order_queue_page.dart';
import 'package:lokshineats_vendor/features/store/models/store.dart';
import 'package:lokshineats_vendor/features/store/providers/store_providers.dart';

Map<String, Object?> order({
  String id = 'ord-1',
  String status = 'delivered',
  String paymentMethod = 'cash',
  bool cashGivenToVendor = false,
  bool vendorCashConfirmed = false,
  bool vendorCashDisputed = false,
  double subtotal = 55.17,
}) => {
  'id': id,
  'status': status,
  'paymentMethod': paymentMethod,
  'items': [
    {'name': 'Full House Kota', 'quantity': 2, 'price': 27.5},
  ],
  'subtotal': subtotal,
  'total': subtotal + 15,
  'vendorPayout': subtotal,
  'deliveryFee': 15.0,
  'cashGivenToVendor': cashGivenToVendor,
  'vendorCashConfirmed': vendorCashConfirmed,
  'vendorCashDisputed': vendorCashDisputed,
  'createdAt': '2026-10-28T10:00:00.000Z',
};

Map<String, Object?> storeJson() => {
  'id': 'store-1',
  'name': "Mini's Mashy Eatery",
  'cuisine': 'Traditional Township Food',
  'address': '12 Khozi Street',
  'city': 'Meadowlands',
  'isOpen': true,
  'deliveryFee': 15.0,
  'minOrderAmount': 30.0,
  'deliveryTime': '30-45 min',
};

ApiClient _api(List<Map<String, Object?>> orders) => ApiClient(
  httpClient: MockClient((request) async {
    final body = request.url.path.contains('/orders')
        ? {'data': orders}
        : {'data': storeJson()};
    return http.Response(
      jsonEncode(body),
      200,
      headers: const {'content-type': 'application/json'},
    );
  }),
  baseUrl: 'http://api.test',
  tokenProvider: () async => 'test-id-token',
);

Future<void> pump(
  WidgetTester tester,
  List<Map<String, Object?>> orders,
) async {
  tester.view.physicalSize = const Size(1080, 4000);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(_api(orders)),
        isSignedInProvider.overrideWithValue(true),
        myStoreProvider.overrideWith(
          () =>
              _FixedStore(Store.fromJson(storeJson() as Map<String, dynamic>)),
        ),
      ],
      child: const MaterialApp(home: OrderQueuePage()),
    ),
  );
  await tester.pumpAndSettle();
}

class _FixedStore extends MyStoreNotifier {
  _FixedStore(this.store);

  final Store store;

  @override
  Future<Store?> build() async => store;
}

void main() {
  testWidgets('says plainly when the driver has not paid yet', (tester) async {
    // The gap this exists for.
    await pump(tester, [order()]);

    expect(
      find.textContaining('has not handed over your R55,17'),
      findsOneWidget,
    );
  });

  testWidgets('totals what drivers owe, so nobody adds up tickets', (
    tester,
  ) async {
    await pump(tester, [order(), order(id: 'ord-2', subtotal: 40.0)]);

    expect(find.textContaining('2 drivers owe you R95,17'), findsOneWidget);
  });

  testWidgets('one driver is one driver, not "1 drivers"', (tester) async {
    await pump(tester, [order()]);

    expect(find.textContaining('A driver owes you R55,17'), findsOneWidget);
  });

  testWidgets('gives money owed its own section', (tester) async {
    await pump(tester, [order()]);

    expect(find.text('Driver owes you'), findsOneWidget);
  });

  testWidgets('says so once the kitchen has confirmed it', (tester) async {
    await pump(tester, [
      order(cashGivenToVendor: true, vendorCashConfirmed: true),
    ]);

    expect(find.textContaining('You confirmed R55,17'), findsOneWidget);
    expect(find.textContaining('has not handed over'), findsNothing);
  });

  testWidgets('a card order is never said to owe anything', (tester) async {
    // Nobody hands over cash for an order already paid by card.
    await pump(tester, [order(paymentMethod: 'card')]);

    expect(find.textContaining('has not handed over'), findsNothing);
    expect(find.text('Delivered.'), findsOneWidget);
  });

  testWidgets('a driver claiming to have paid still asks, not tells', (
    tester,
  ) async {
    await pump(tester, [order(cashGivenToVendor: true)]);

    expect(find.text('Cash to confirm'), findsOneWidget);
    expect(find.textContaining('has not handed over'), findsNothing);
  });
}
