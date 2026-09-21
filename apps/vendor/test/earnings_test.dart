/// A kitchen's earnings screen: where it stands, and what each order meant.
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
import 'package:lokshineats_core/utils/money.dart';

import 'package:lokshineats_vendor/features/earnings/pages/earnings_page.dart';

http.Response _json(int status, Object body) => http.Response(
  jsonEncode(body),
  status,
  headers: {'content-type': 'application/json'},
);

Map<String, dynamic> ledgerEntry(
  String id,
  String type,
  double amount, {
  String orderId = 'order-abc123',
  String balance = 'available',
}) => {
  'id': id,
  'walletId': 'vendor-1',
  'type': type,
  'amount': amount,
  'balance': balance,
  'balanceAfter': 0,
  'orderId': orderId,
  'description': type,
  'createdAt': DateTime.now().toUtc().toIso8601String(),
};

Future<void> pumpEarnings(
  WidgetTester tester, {
  required Map<String, dynamic> wallet,
  required List<Map<String, dynamic>> entries,
}) async {
  tester.view.physicalSize = const Size(1000, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        isSignedInProvider.overrideWithValue(true),
        apiClientProvider.overrideWithValue(
          ApiClient(
            httpClient: MockClient((request) async {
              if (request.url.path.endsWith('/transactions')) {
                return _json(200, {'data': entries});
              }
              return _json(200, {'data': wallet});
            }),
            baseUrl: 'http://api.test',
            tokenProvider: () async => 'test-id-token',
          ),
        ),
      ],
      child: const MaterialApp(home: Scaffold(body: EarningsPage())),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a kitchen owing commission on cash is told why, in words', (
    tester,
  ) async {
    await pumpEarnings(
      tester,
      wallet: {'availableBalance': -8, 'pendingBalance': 0, 'totalBalance': -8},
      entries: [
        ledgerEntry('4', 'cash_handover', -100),
        ledgerEntry('3', 'adjustment', 92),
        ledgerEntry('2', 'adjustment', -92, balance: 'pending'),
        ledgerEntry('1', 'order_earning', 92, balance: 'pending'),
      ],
    );

    expect(find.text('You owe LokshinEats'), findsOneWidget);
    expect(find.text(formatRands(8)), findsOneWidget);
    expect(find.textContaining('Commission on cash orders'), findsOneWidget);

    // One row for the order, explained, without the internal bucket moves.
    expect(find.text('Order #ABC123'), findsOneWidget);
    expect(find.text('Order earnings'), findsOneWidget);
    expect(find.text('Paid to you in cash by the driver'), findsOneWidget);
    expect(find.text('Adjustment'), findsNothing);

    // The week counts what was earned, not what is owed.
    expect(find.text('1 order'), findsOneWidget);
    expect(find.text(formatRands(92)), findsOneWidget);
  });

  testWidgets('money still on its way is called out', (tester) async {
    await pumpEarnings(
      tester,
      wallet: {
        'availableBalance': 0,
        'pendingBalance': 165.58,
        'totalBalance': 165.58,
      },
      entries: [ledgerEntry('1', 'order_earning', 165.58, balance: 'pending')],
    );

    expect(find.text('LokshinEats owes you'), findsOneWidget);
    expect(find.textContaining('still on their way'), findsOneWidget);
  });

  testWidgets('a new kitchen is told what will appear here', (tester) async {
    await pumpEarnings(
      tester,
      wallet: {'availableBalance': 0, 'pendingBalance': 0, 'totalBalance': 0},
      entries: const [],
    );

    expect(find.text('No earnings yet'), findsOneWidget);
    expect(find.text('LokshinEats owes you'), findsOneWidget);
  });
}
