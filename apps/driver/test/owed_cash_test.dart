/// What a driver still owes the kitchens.
///
/// A driver holding cash for three delivered orders had to open each one to
/// find out. The board now says it before anything else, because it is the
/// part of this screen somebody else is waiting on.
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

import 'package:lokshineats_driver/features/orders/pages/my_deliveries_page.dart';

Map<String, Object?> delivery({
  String id = 'ord-1',
  String status = 'delivered',
  String paymentMethod = 'cash',
  bool cashGivenToVendor = false,
  bool vendorCashDisputed = false,
  double subtotal = 55.17,
  String storeName = "Mini's Mashy Eatery",
  Duration? dueIn,
}) => {
  'id': id,
  'status': status,
  'paymentMethod': paymentMethod,
  'storeName': storeName,
  'storeAddress': '12 Khozi Street',
  'items': [
    {'name': 'Full House Kota', 'quantity': 2, 'price': 27.5},
  ],
  'subtotal': subtotal,
  'total': subtotal + 15,
  'deliveryFee': 15.0,
  'driverPayout': 12.75,
  'cashGivenToVendor': cashGivenToVendor,
  'vendorCashConfirmed': false,
  'vendorCashDisputed': vendorCashDisputed,
  'deliveryAddress': {'street': '1 Vilakazi Street', 'city': 'Soweto'},
  'createdAt': '2026-10-28T10:00:00.000Z',
  if (dueIn != null)
    'cashDueAt': DateTime.now().add(dueIn).toUtc().toIso8601String(),
};

ApiClient _api(List<Map<String, Object?>> deliveries) => ApiClient(
  httpClient: MockClient((request) async {
    return http.Response(
      jsonEncode({'data': deliveries}),
      200,
      headers: const {'content-type': 'application/json'},
    );
  }),
  baseUrl: 'http://api.test',
  tokenProvider: () async => 'test-id-token',
);

Future<void> pump(
  WidgetTester tester,
  List<Map<String, Object?>> deliveries,
) async {
  tester.view.physicalSize = const Size(1080, 4000);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(_api(deliveries)),
        isSignedInProvider.overrideWithValue(true),
      ],
      child: const MaterialApp(home: Scaffold(body: MyDeliveriesPage())),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a disputed handover is still money they are carrying', (
    tester,
  ) async {
    // It used to drop off this board the moment the kitchen said the money
    // never arrived - so the driver was told they owed nothing while a
    // kitchen was saying the opposite.
    await pump(tester, [
      delivery(cashGivenToVendor: true, vendorCashDisputed: true),
    ]);

    expect(find.textContaining('You still owe'), findsOneWidget);
    expect(find.textContaining('R55,17'), findsWidgets);
  });

  testWidgets('and says that is what it is', (tester) async {
    await pump(tester, [
      delivery(cashGivenToVendor: true, vendorCashDisputed: true),
    ]);

    expect(
      find.textContaining('says money you handed over never arrived'),
      findsOneWidget,
    );
  });

  testWidgets('money still owed is not filed under Finished', (tester) async {
    await pump(tester, [delivery()]);

    expect(find.text('Finished'), findsNothing);
  });

  testWidgets('a settled delivery is', (tester) async {
    await pump(tester, [delivery(cashGivenToVendor: true)]);

    expect(find.text('Finished'), findsOneWidget);
    expect(find.textContaining('You still owe'), findsNothing);
  });

  testWidgets('says by when, so nobody learns the rule by being locked out', (
    tester,
  ) async {
    await pump(tester, [delivery(dueIn: const Duration(hours: 5))]);

    expect(
      find.textContaining('cannot take another delivery'),
      findsOneWidget,
    );
    expect(find.textContaining('Hand it over by'), findsOneWidget);
  });

  testWidgets('says plainly when the deadline has gone', (tester) async {
    await pump(tester, [delivery(dueIn: const Duration(hours: -3))]);

    expect(find.textContaining('Overdue.'), findsOneWidget);
    expect(find.textContaining('can be suspended'), findsOneWidget);
  });

  testWidgets('an order with no deadline says nothing about one', (
    tester,
  ) async {
    // Delivered before the clock existed: no deliveredAt to measure from.
    await pump(tester, [delivery()]);

    expect(find.textContaining('Hand it over by'), findsNothing);
    expect(find.textContaining('Overdue.'), findsNothing);
  });

  testWidgets('says what is owed, and to how many kitchens', (tester) async {
    await pump(tester, [
      delivery(),
      delivery(id: 'ord-2', subtotal: 40, storeName: 'Kasi Kota'),
    ]);

    expect(find.textContaining('You still owe 2 kitchens'), findsOneWidget);
    expect(find.textContaining('R95,17'), findsWidgets);
  });

  testWidgets('one kitchen is one kitchen', (tester) async {
    await pump(tester, [delivery()]);

    expect(
      find.textContaining('You still owe a kitchen R55,17'),
      findsOneWidget,
    );
  });

  testWidgets('nothing owed, nothing said', (tester) async {
    await pump(tester, [delivery(cashGivenToVendor: true)]);

    expect(find.textContaining('You still owe'), findsNothing);
  });

  testWidgets('a card order is never owed', (tester) async {
    // The customer paid online; there is no cash to pass on.
    await pump(tester, [delivery(paymentMethod: 'card')]);

    expect(find.textContaining('You still owe'), findsNothing);
  });

  testWidgets('a delivery still in progress is not owed yet', (tester) async {
    await pump(tester, [delivery(status: 'picked_up')]);

    expect(find.textContaining('You still owe'), findsNothing);
  });

  testWidgets('fits a small phone', (tester) async {
    tester.view.physicalSize = const Size(640, 2400);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);

    await pump(tester, [delivery()]);

    expect(tester.takeException(), isNull);
  });
}
