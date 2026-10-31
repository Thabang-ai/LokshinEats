/// What a driver sees on the board when they are late paying a kitchen.
///
/// The API refuses the claim either way. Showing them a board full of work
/// and letting them discover that one tap at a time is the wrong way round:
/// the screen should say why there is nothing to take, and what ends it.
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

import 'package:lokshineats_driver/features/orders/pages/available_deliveries_page.dart';

Map<String, Object?> order({
  required String id,
  String status = 'confirmed',
  String? driverId,
  String paymentMethod = 'cash',
  bool cashGivenToVendor = false,
  Duration? dueIn,
  double subtotal = 55.17,
}) => {
  'id': id,
  'status': status,
  'paymentMethod': paymentMethod,
  'storeName': "Mini's Mashy Eatery",
  'storeAddress': '12 Khozi Street',
  'driverId': driverId,
  'items': [
    {'name': 'Full House Kota', 'quantity': 1, 'price': subtotal},
  ],
  'subtotal': subtotal,
  'total': subtotal + 15,
  'deliveryFee': 15.0,
  'driverPayout': 12.75,
  'cashGivenToVendor': cashGivenToVendor,
  'vendorCashConfirmed': false,
  'vendorCashDisputed': false,
  'deliveryAddress': {'street': '1 Vilakazi Street', 'city': 'Soweto'},
  'createdAt': '2026-10-30T10:00:00.000Z',
  if (dueIn != null)
    'cashDueAt': DateTime.now().add(dueIn).toUtc().toIso8601String(),
};

/// Available deliveries on one path, this driver's own on the other.
ApiClient _api({
  required List<Map<String, Object?>> available,
  required List<Map<String, Object?>> mine,
}) => ApiClient(
  httpClient: MockClient((request) async {
    final body = request.url.path.contains('available') ? available : mine;
    return http.Response(
      jsonEncode({'data': body}),
      200,
      headers: const {'content-type': 'application/json'},
    );
  }),
  baseUrl: 'http://api.test',
  tokenProvider: () async => 'test-id-token',
);

Future<void> pump(
  WidgetTester tester, {
  required List<Map<String, Object?>> available,
  required List<Map<String, Object?>> mine,
}) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(
          _api(available: available, mine: mine),
        ),
        isSignedInProvider.overrideWithValue(true),
      ],
      child: const MaterialApp(
        home: Scaffold(body: AvailableDeliveriesPage()),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// A delivery this driver has not paid the kitchen for, due whenever.
Map<String, Object?> unpaid(Duration dueIn) => order(
  id: 'ord-owed',
  status: 'delivered',
  driverId: 'drv-1',
  dueIn: dueIn,
);

void main() {
  testWidgets('past the deadline, the board is replaced by the reason', (
    tester,
  ) async {
    await pump(
      tester,
      available: [order(id: 'ord-free')],
      mine: [unpaid(const Duration(hours: -2))],
    );

    expect(find.text('No new deliveries until you pay'), findsOneWidget);
    expect(find.textContaining("Mini's Mashy Eatery"), findsOneWidget);
    expect(find.textContaining('R55,17'), findsOneWidget);
  });

  testWidgets('and says what ends it', (tester) async {
    await pump(
      tester,
      available: [order(id: 'ord-free')],
      mine: [unpaid(const Duration(hours: -2))],
    );

    expect(find.textContaining('the board comes back'), findsOneWidget);
    expect(find.textContaining('account is suspended'), findsOneWidget);
  });

  testWidgets('inside the deadline the board is the board', (tester) async {
    // Owing money is not the same as being late with it.
    await pump(
      tester,
      available: [order(id: 'ord-free')],
      mine: [unpaid(const Duration(hours: 5))],
    );

    expect(find.text('No new deliveries until you pay'), findsNothing);
    expect(find.text('Claim this delivery'), findsWidgets);
  });

  testWidgets('owing nothing, the board is the board', (tester) async {
    await pump(tester, available: [order(id: 'ord-free')], mine: const []);

    expect(find.text('No new deliveries until you pay'), findsNothing);
    expect(find.text('Claim this delivery'), findsWidgets);
  });
}
