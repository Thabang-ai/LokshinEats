/// Wallet state: the balance and its history, one page at a time.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/providers.dart';
import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/wallet/wallet.dart';
import 'package:lokshineats_core/wallet/wallet_repository.dart';

final walletRepositoryProvider = Provider<WalletRepository>((ref) {
  return WalletRepository(ref.watch(apiClientProvider));
});

/// No automatic retries: a failure is shown with a "Try again" button rather
/// than retried out of sight. Same policy as order history.
Duration? _noRetry(int retryCount, Object error) => null;

class WalletState {
  const WalletState({
    required this.wallet,
    required this.entries,
    required this.nextCursor,
    this.isLoadingMore = false,
    this.loadMoreFailed = false,
  });

  static const empty = WalletState(
    wallet: Wallet(availableBalance: 0, pendingBalance: 0, totalBalance: 0),
    entries: [],
    nextCursor: null,
  );

  final Wallet wallet;
  final List<LedgerEntry> entries;
  final String? nextCursor;
  final bool isLoadingMore;

  /// Loading an older page failed. What is already on screen is still right,
  /// so the page keeps it and offers to try again.
  final bool loadMoreFailed;

  bool get hasMore => nextCursor != null;

  WalletState copyWith({bool? isLoadingMore, bool? loadMoreFailed}) {
    return WalletState(
      wallet: wallet,
      entries: entries,
      nextCursor: nextCursor,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      loadMoreFailed: loadMoreFailed ?? this.loadMoreFailed,
    );
  }
}

class WalletNotifier extends AsyncNotifier<WalletState> {
  @override
  Future<WalletState> build() async {
    // Rebuilt on sign-in and sign-out, so one account never sees another's
    // balance.
    if (!ref.watch(isSignedInProvider)) return WalletState.empty;

    final repository = ref.read(walletRepositoryProvider);

    // One after the other rather than in parallel: if both failed together,
    // the second error would surface as an unhandled one instead of the
    // API's own message.
    final wallet = await repository.fetchMine();
    final page = await repository.fetchMyTransactions();

    return WalletState(
      wallet: wallet,
      entries: page.entries,
      nextCursor: page.nextCursor,
    );
  }

  /// Load older pages until the history reaches back [window], or runs out.
  ///
  /// For "this week" figures: a busy driver's week is more than one page, and
  /// a total over a partial week would read as a bad week rather than an
  /// incomplete one. Stops on a failed page instead of retrying in a loop.
  Future<void> loadBack(Duration window) async {
    final cutoff = DateTime.now().subtract(window);

    while (true) {
      final current = state.value;
      if (current == null || !current.hasMore || current.loadMoreFailed) {
        return;
      }

      final oldest = current.entries.isEmpty
          ? null
          : current.entries.last.createdAt;
      if (oldest != null && oldest.isBefore(cutoff)) return;

      final before = current.entries.length;
      await loadMore();

      // Nothing new arrived: a page already in flight, or an empty one.
      // Either way another turn round the loop would not get further.
      if ((state.value?.entries.length ?? before) == before) return;
    }
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || !current.hasMore || current.isLoadingMore) return;

    state = AsyncData(
      current.copyWith(isLoadingMore: true, loadMoreFailed: false),
    );

    try {
      final page = await ref
          .read(walletRepositoryProvider)
          .fetchMyTransactions(cursor: current.nextCursor);
      if (!ref.mounted) return;

      state = AsyncData(
        WalletState(
          wallet: current.wallet,
          entries: [...current.entries, ...page.entries],
          nextCursor: page.nextCursor,
        ),
      );
    } catch (_) {
      if (!ref.mounted) return;
      state = AsyncData(
        current.copyWith(isLoadingMore: false, loadMoreFailed: true),
      );
    }
  }
}

final walletProvider =
    AsyncNotifierProvider.autoDispose<WalletNotifier, WalletState>(
      WalletNotifier.new,
      retry: _noRetry,
    );
