/// Tests for the customer wallet.
///
/// A wallet is read-only from this app — every entry is written server-side —
/// so what is worth pinning is that the ledger is read faithfully (signs,
/// types, the order behind a refund) and that the screen says plainly what
/// the balance is and where each line came from.
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:lokshineats_customer/core/network/api_client.dart';
import 'package:lokshineats_customer/core/providers.dart';
import 'package:lokshineats_customer/core/theme/app_theme.dart';
import 'package:lokshineats_customer/features/auth/providers/auth_providers.dart';
import 'package:lokshineats_customer/features/orders/models/order.dart';
import 'package:lokshineats_customer/features/orders/widgets/order_sections.dart';
import 'package:lokshineats_customer/features/wallet/models/wallet.dart';
import 'package:lokshineats_customer/features/wallet/pages/wallet_page.dart';
import 'package:lokshineats_customer/features/wallet/repositories/wallet_repository.dart';

Map<String, dynamic> walletJson({double available = 65.5}) => {
  'id': 'cust-1',
  'ownerId': 'cust-1',
  'availableBalance': available,
  'pendingBalance': 0,
  'totalBalance': available,
  'currency': 'ZAR',
  'updatedAt': '2026-09-15T18:30:00.000Z',
};

Map<String, dynamic> entryJson({
  String id = 'entry-1',
  String type = 'refund',
  double amount = 65.5,
  String? orderId = 'order-1',
  String description = 'Refund for order order-1: Kitchen closed early',
}) => {
  'id': id,
  'walletId': 'cust-1',
  'type': type,
  'amount': amount,
  'balance': 'available',
  'balanceAfter': amount,
  'orderId': orderId,
  'paymentId': 'pay-1',
  'description': description,
  'createdAt': '2026-09-15T18:30:00.000Z',
};

http.Response _json(int status, Object body) => http.Response(
  jsonEncode(body),
  status,
  headers: {'content-type': 'application/json'},
);

ApiClient _client(http.Client http) => ApiClient(
  httpClient: http,
  baseUrl: 'http://api.test',
  tokenProvider: () async => 'test-id-token',
);

void main() {
  group('ledger model', () {
    test('reads a refund with its order and a signed amount', () {
      final entry = LedgerEntry.fromJson(entryJson());

      expect(entry.type, LedgerEntryType.refund);
      expect(entry.amount, 65.5);
      expect(entry.isCredit, isTrue);
      expect(entry.orderId, 'order-1');
      expect(entry.isPending, isFalse);
      expect(entry.createdAt?.toUtc(), DateTime.utc(2026, 9, 15, 18, 30));
    });

    test('a negative amount is a debit', () {
      final entry = LedgerEntry.fromJson(entryJson(type: 'refund', amount: -20));

      expect(entry.isCredit, isFalse);
    });

    test('an unknown entry type reads as an adjustment, like the server', () {
      expect(
        LedgerEntry.fromJson(entryJson(type: 'airdrop')).type,
        LedgerEntryType.adjustment,
      );
    });

    test('a wallet with no activity reads as zero, not a failure', () {
      final wallet = Wallet.fromJson(const {'id': 'cust-1'});

      expect(wallet.availableBalance, 0);
      expect(wallet.updatedAt, isNull);
    });
  });

  group('repository', () {
    test('reads only the caller\'s own wallet, authenticated', () async {
      final requests = <http.BaseRequest>[];

      final repository = WalletRepository(
        _client(
          MockClient((request) async {
            requests.add(request);
            if (request.url.path.endsWith('/transactions')) {
              return _json(200, {
                'data': [entryJson()],
                'nextCursor': 'cursor-2',
              });
            }
            return _json(200, {'data': walletJson()});
          }),
        ),
      );

      final wallet = await repository.fetchMine();
      final page = await repository.fetchMyTransactions(cursor: 'cursor-1');

      expect(requests.map((r) => r.url.path), [
        '/api/v1/wallets/me',
        '/api/v1/wallets/me/transactions',
      ]);
      expect(
        requests.every(
          (r) => r.headers['Authorization'] == 'Bearer test-id-token',
        ),
        isTrue,
      );
      expect(requests.last.url.queryParameters['cursor'], 'cursor-1');
      expect(wallet.availableBalance, 65.5);
      expect(page.entries.single.type, LedgerEntryType.refund);
      expect(page.nextCursor, 'cursor-2');
    });
  });

  group('wallet screen', () {
    Future<void> pumpWallet(
      WidgetTester tester, {
      required List<Map<String, dynamic>> entries,
      double available = 65.5,
      String? nextCursor,
    }) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            isSignedInProvider.overrideWithValue(true),
            apiClientProvider.overrideWithValue(
              _client(
                MockClient((request) async {
                  if (request.url.path.endsWith('/transactions')) {
                    return _json(200, {
                      'data': entries,
                      'nextCursor': nextCursor,
                    });
                  }
                  return _json(200, {'data': walletJson(available: available)});
                }),
              ),
            ),
          ],
          child: MaterialApp(theme: AppTheme.light, home: const WalletPage()),
        ),
      );
      await tester.pumpAndSettle();
    }

    testWidgets('shows the balance and says where each line came from', (
      tester,
    ) async {
      await pumpWallet(
        tester,
        entries: [
          entryJson(),
          entryJson(
            id: 'entry-2',
            type: 'bonus',
            amount: 20,
            orderId: null,
            description: 'Welcome credit',
          ),
        ],
      );

      expect(find.text('YOUR BALANCE'), findsOneWidget);
      expect(find.text('Refund'), findsOneWidget);
      expect(
        find.text('Refund for order order-1: Kitchen closed early'),
        findsOneWidget,
      );
      expect(find.text('Credit'), findsOneWidget);
      expect(find.text('Welcome credit'), findsOneWidget);
      // Credits are marked as money coming in.
      expect(find.textContaining('+'), findsNWidgets(2));
    });

    testWidgets('an empty wallet says what will appear, not that it failed', (
      tester,
    ) async {
      await pumpWallet(tester, entries: const [], available: 0);

      expect(find.text('No wallet activity yet'), findsOneWidget);
      expect(find.text('Show older activity'), findsNothing);
    });

    testWidgets('offers older activity when the server has more', (
      tester,
    ) async {
      await pumpWallet(tester, entries: [entryJson()], nextCursor: 'cursor-2');

      expect(find.text('Show older activity'), findsOneWidget);
    });

    testWidgets('asks a signed-out customer to sign in', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [isSignedInProvider.overrideWithValue(false)],
          child: MaterialApp(theme: AppTheme.light, home: const WalletPage()),
        ),
      );
      await tester.pump();

      expect(find.text('Sign in to see your wallet'), findsOneWidget);
    });
  });

  group('refund wording on orders', () {
    testWidgets('a refunded order says where the money went', (tester) async {
      // A refunded order is usually also cancelled. The payment line used to
      // reach the cancelled case first and call it "Not charged" — wrong for
      // a card order that was charged and then refunded to the wallet.
      final order = CustomerOrder.fromJson(const {
        'id': 'order-1',
        'status': 'cancelled',
        'paymentStatus': 'refunded',
        'paymentMethod': 'yoco',
        'total': 65.5,
      });

      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light,
          home: Scaffold(body: PaymentStatusRow(order: order)),
        ),
      );

      expect(find.text('Refunded to your LokshinEats wallet'), findsOneWidget);
      expect(find.textContaining('Not charged'), findsNothing);
    });

    testWidgets('a cancelled order that was never paid is still uncharged', (
      tester,
    ) async {
      final order = CustomerOrder.fromJson(const {
        'id': 'order-2',
        'status': 'cancelled',
        'paymentStatus': 'pending',
        'paymentMethod': 'yoco',
        'total': 65.5,
      });

      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light,
          home: Scaffold(body: PaymentStatusRow(order: order)),
        ),
      );

      expect(find.textContaining('Not charged'), findsOneWidget);
    });
  });
}
