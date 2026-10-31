/// Rating the kitchen and the driver, from the order you received.
///
/// The thing worth pinning: this is asked once. A customer who has already
/// rated sees what they said, not a form that the API will refuse - and
/// nobody is shown a form at all until the API has answered what is already
/// there.
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

import 'package:lokshineats_customer/features/orders/models/order.dart';
import 'package:lokshineats_customer/features/orders/widgets/rate_order_card.dart';

Map<String, Object?> orderJson({String? driverId = 'drv-1'}) => {
  'id': 'ord-1',
  'status': 'delivered',
  'storeId': 'store-1',
  'storeName': "Mini's Mashy Eatery",
  'driverId': driverId,
  'items': [
    {'name': 'Full House Kota', 'quantity': 1, 'price': 55.0},
  ],
  'subtotal': 55.0,
  'deliveryFee': 15.0,
  'total': 70.0,
  'paymentMethod': 'cash',
  'paymentStatus': 'pending',
  'deliveryAddress': {'street': '1 Vilakazi Street', 'city': 'Soweto'},
  'createdAt': '2026-10-29T10:00:00.000Z',
};

/// The API, with whatever has already been said about this order.
late List<Map<String, Object?>> sent;

ApiClient _api(List<Map<String, Object?>> existing, {bool failLookup = false}) {
  return ApiClient(
    httpClient: MockClient((request) async {
      if (failLookup && request.method == 'GET') {
        return http.Response('{}', 500);
      }
      if (request.method == 'POST') {
        sent.add(jsonDecode(request.body) as Map<String, Object?>);
        return http.Response(
          jsonEncode({
            'data': [
              {'target': 'store', 'rating': 5},
            ],
          }),
          201,
          headers: const {'content-type': 'application/json'},
        );
      }

      return http.Response(
        jsonEncode({'data': existing}),
        200,
        headers: const {'content-type': 'application/json'},
      );
    }),
    baseUrl: 'http://api.test',
    tokenProvider: () async => 'test-id-token',
  );
}

Future<void> pump(
  WidgetTester tester, {
  List<Map<String, Object?>> existing = const [],
  String? driverId = 'drv-1',
  bool failLookup = false,
}) async {
  sent = [];
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(
          _api(existing, failLookup: failLookup),
        ),
        isSignedInProvider.overrideWithValue(true),
      ],
      child: MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: RateOrderCard(
              order: CustomerOrder.fromJson(
                orderJson(driverId: driverId) as Map<String, dynamic>,
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// Tap the nth star in a row of five.
Future<void> tapStar(WidgetTester tester, int row, int star) async {
  final stars = find.byType(IconButton);
  await tester.tap(stars.at(row * 5 + (star - 1)));
  await tester.pump();
}

void main() {
  testWidgets('asks about the kitchen and the driver', (tester) async {
    await pump(tester);

    expect(find.text('How was it?'), findsOneWidget);
    expect(find.text("Mini's Mashy Eatery"), findsOneWidget);
    expect(find.text('Your driver'), findsOneWidget);
  });

  testWidgets('an order nobody delivered asks only about the kitchen', (
    tester,
  ) async {
    await pump(tester, driverId: null);

    expect(find.text('Your driver'), findsNothing);
  });

  testWidgets('will not send nothing', (tester) async {
    await pump(tester);

    final button = tester.widget<FilledButton>(find.byType(FilledButton));
    expect(button.onPressed, isNull);
  });

  testWidgets('sends the stars that were tapped', (tester) async {
    await pump(tester);

    await tapStar(tester, 0, 4);
    await tester.tap(find.byType(FilledButton));
    await tester.pumpAndSettle();

    expect(sent, hasLength(1));
    expect(sent.first['store'], {'rating': 4});
    expect(sent.first.containsKey('driver'), isFalse);
  });

  testWidgets('carries the words along with the stars', (tester) async {
    await pump(tester);

    await tapStar(tester, 0, 5);
    await tester.enterText(find.byType(TextField), 'The kota was enormous.');
    await tester.tap(find.byType(FilledButton));
    await tester.pumpAndSettle();

    expect(
      (sent.first['store']! as Map)['comment'],
      'The kota was enormous.',
    );
  });

  testWidgets('asks once: an order already rated shows what was said', (
    tester,
  ) async {
    await pump(
      tester,
      existing: [
        {'target': 'store', 'rating': 4},
        {'target': 'driver', 'rating': 5},
      ],
    );

    expect(find.text('Thanks for rating'), findsOneWidget);
    expect(find.byType(FilledButton), findsNothing);
    expect(find.byType(TextField), findsNothing);
  });

  testWidgets('a half-rated order still asks about the other one', (
    tester,
  ) async {
    await pump(tester, existing: [
      {'target': 'store', 'rating': 4},
    ]);

    expect(find.text('How was it?'), findsOneWidget);
    expect(find.byType(FilledButton), findsOneWidget);
  });

  testWidgets('a failed lookup still offers the form', (tester) async {
    // It used to fall through the same gap as "still loading" and show
    // nothing at all - no stars, no error, no way to tell the feature was
    // even there.
    await pump(tester, failLookup: true);

    expect(find.text('How was it?'), findsOneWidget);
    expect(find.byType(FilledButton), findsOneWidget);
  });

  testWidgets('nothing is offered until the API has answered', (tester) async {
    // Offering a form and then refusing it is worse than a moment's wait.
    await pump(tester);
    await tester.pumpWidget(const SizedBox.shrink());

    expect(find.text('How was it?'), findsNothing);
  });
}
