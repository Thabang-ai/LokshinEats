/// A driver's earnings screen, and what a cash delivery reads as.
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

import 'package:lokshineats_driver/features/earnings/pages/earnings_page.dart';

http.Response _json(int status, Object body) => http.Response(
  jsonEncode(body),
  status,
  headers: {'content-type': 'application/json'},
);

Map<String, dynamic> ledgerEntry(String id, String type, double amount) => {
  'id': id,
  'walletId': 'driver-1',
  'type': type,
  'amount': amount,
  'balance': 'available',
  'balanceAfter': 0,
  'orderId': 'order-abc123',
  'description': type,
  'createdAt': DateTime.now().toUtc().toIso8601String(),
};

void main() {
  testWidgets('a cash delivery explains the driver’s balance', (tester) async {
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
                  return _json(200, {
                    'data': [
                      ledgerEntry('3', 'cash_handover', 179.98),
                      ledgerEntry('2', 'cash_collected', -199.98),
                      ledgerEntry('1', 'order_earning', 17),
                    ],
                  });
                }
                return _json(200, {
                  'data': {
                    'availableBalance': -3,
                    'pendingBalance': 0,
                    'totalBalance': -3,
                  },
                });
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

    expect(find.text('You owe LokshinEats'), findsOneWidget);
    expect(
      find.textContaining('Cash you collected at the door'),
      findsOneWidget,
    );

    expect(find.text('Delivery pay'), findsOneWidget);
    expect(find.text('Cash collected from the customer'), findsOneWidget);
    expect(find.text('Cash handed to the kitchen'), findsOneWidget);

    // The delivery's net and the week's pay are different numbers, both true.
    expect(find.text('−${formatRands(3)}'), findsOneWidget);
    expect(find.text('1 delivery'), findsOneWidget);
    expect(find.text(formatRands(17)), findsOneWidget);
  });
}
