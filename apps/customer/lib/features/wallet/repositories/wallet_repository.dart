/// The signed-in customer's wallet, via the API.
///
/// Both calls are scoped server-side to the caller's own uid — there is no
/// wallet id to send, so there is no way to ask for someone else's.
library;

import '../../../core/network/api_client.dart';
import '../models/wallet.dart';

class WalletRepository {
  const WalletRepository(this._client);

  final ApiClient _client;

  /// Current balances. A customer with no activity gets an empty wallet
  /// rather than a 404.
  Future<Wallet> fetchMine() async {
    final response = await _client.get<Wallet>(
      '/api/v1/wallets/me',
      authenticated: true,
      decode: (json) => Wallet.fromJson(json! as Map<String, dynamic>),
    );

    return response.data;
  }

  /// One page of the ledger. Pass the previous page's
  /// [LedgerPage.nextCursor] to continue.
  Future<LedgerPage> fetchMyTransactions({
    String? cursor,
    int limit = 20,
  }) async {
    final response = await _client.get<List<LedgerEntry>>(
      '/api/v1/wallets/me/transactions',
      authenticated: true,
      query: {'limit': '$limit', 'cursor': ?cursor},
      decode: (json) => decodeList(json, LedgerEntry.fromJson),
    );

    return LedgerPage(entries: response.data, nextCursor: response.nextCursor);
  }
}

class LedgerPage {
  const LedgerPage({required this.entries, required this.nextCursor});

  final List<LedgerEntry> entries;

  /// Null when there are no older entries.
  final String? nextCursor;
}
