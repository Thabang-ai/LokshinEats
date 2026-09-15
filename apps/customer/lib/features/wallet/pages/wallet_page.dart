/// The customer's wallet: what LokshinEats has credited back, and why.
///
/// Every line explains itself — the kind of entry, what it was for, when, and
/// the order behind it when there is one — because a balance nobody can
/// account for is a support ticket waiting to happen.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/money.dart';
import '../../../shared/widgets/async_states.dart';
import '../../auth/pages/sign_in_page.dart';
import '../../auth/providers/auth_providers.dart';
import '../../orders/pages/order_tracking_page.dart';
import '../models/wallet.dart';
import '../providers/wallet_providers.dart';

class WalletPage extends ConsumerWidget {
  const WalletPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final signedIn = ref.watch(isSignedInProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Wallet')),
      body: SafeArea(
        child: signedIn ? const _WalletBody() : const _SignedOut(),
      ),
    );
  }
}

class _WalletBody extends ConsumerWidget {
  const _WalletBody();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wallet = ref.watch(walletProvider);

    return wallet.when(
      loading: () => const _Skeleton(),
      error: (error, _) => ErrorState(
        error: error,
        onRetry: () => ref.invalidate(walletProvider),
      ),
      data: (state) => RefreshIndicator(
        onRefresh: () => ref.refresh(walletProvider.future),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          children: [
            _BalanceCard(wallet: state.wallet),
            const SizedBox(height: 24),
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 0, 4, 10),
              child: Text(
                'Activity',
                style: Theme.of(
                  context,
                ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800),
              ),
            ),
            if (state.entries.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 24),
                child: EmptyState(
                  title: 'No wallet activity yet',
                  subtitle:
                      'Refunds and credits from LokshinEats will show up '
                      'here.',
                  emoji: '👛',
                ),
              )
            else
              Card(
                clipBehavior: Clip.antiAlias,
                child: Column(
                  children: [
                    for (var i = 0; i < state.entries.length; i++) ...[
                      if (i > 0) const Divider(height: 1),
                      _EntryRow(entry: state.entries[i]),
                    ],
                  ],
                ),
              ),
            if (state.hasMore || state.loadMoreFailed)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Center(
                  child: state.isLoadingMore
                      ? const Padding(
                          padding: EdgeInsets.all(12),
                          child: CircularProgressIndicator(),
                        )
                      : TextButton.icon(
                          onPressed: () =>
                              ref.read(walletProvider.notifier).loadMore(),
                          icon: Icon(
                            state.loadMoreFailed
                                ? Icons.refresh_rounded
                                : Icons.expand_more_rounded,
                          ),
                          label: Text(
                            state.loadMoreFailed
                                ? 'Could not load more — try again'
                                : 'Show older activity',
                          ),
                        ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _BalanceCard extends StatelessWidget {
  const _BalanceCard({required this.wallet});

  final Wallet wallet;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Semantics(
      label: 'Wallet balance ${formatRands(wallet.availableBalance)}',
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [scheme.primary, AppColors.clay],
          ),
          borderRadius: BorderRadius.circular(AppTheme.radius),
        ),
        child: ExcludeSemantics(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    Icons.account_balance_wallet_rounded,
                    size: 18,
                    color: scheme.onPrimary,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'YOUR BALANCE',
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: scheme.onPrimary,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.2,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                formatRands(wallet.availableBalance),
                style: theme.textTheme.displaySmall?.copyWith(
                  color: scheme.onPrimary,
                  fontWeight: FontWeight.w900,
                ),
              ),
              if (wallet.pendingBalance > 0) ...[
                const SizedBox(height: 6),
                Text(
                  '${formatRands(wallet.pendingBalance)} on hold',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: scheme.onPrimary.withValues(alpha: 0.9),
                  ),
                ),
              ],
              const SizedBox(height: 12),
              Text(
                'Refunds and credits from LokshinEats land here.',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: scheme.onPrimary.withValues(alpha: 0.9),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EntryRow extends StatelessWidget {
  const _EntryRow({required this.entry});

  final LedgerEntry entry;

  static final DateFormat _when = DateFormat('d MMM yyyy, HH:mm');

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = StatusColors.of(context);
    final created = entry.createdAt;
    final orderId = entry.orderId;

    final amountText =
        '${entry.isCredit ? '+' : '−'}${formatRands(entry.amount.abs())}';

    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      leading: CircleAvatar(
        backgroundColor: theme.colorScheme.surfaceContainerHighest,
        child: Icon(
          switch (entry.type) {
            LedgerEntryType.refund => Icons.undo_rounded,
            LedgerEntryType.bonus => Icons.card_giftcard_rounded,
            LedgerEntryType.withdrawal => Icons.north_east_rounded,
            _ => Icons.tune_rounded,
          },
          color: theme.colorScheme.onSurfaceVariant,
        ),
      ),
      title: Text(
        entry.type.label,
        style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (entry.description.isNotEmpty)
            Text(
              entry.description,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          Text(
            [
              if (created != null) _when.format(created),
              if (entry.isPending) 'On hold',
            ].join(' · '),
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            amountText,
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: entry.isCredit
                  ? status.success
                  : theme.colorScheme.onSurface,
            ),
          ),
          if (orderId != null)
            Icon(
              Icons.chevron_right_rounded,
              color: theme.colorScheme.onSurfaceVariant,
            ),
        ],
      ),
      // A refund links to the order it was for, so the customer can see what
      // it was about without asking.
      onTap: orderId == null
          ? null
          : () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => OrderTrackingPage(orderId: orderId),
              ),
            ),
    );
  }
}

class _SignedOut extends StatelessWidget {
  const _SignedOut();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const EmptyState(
              title: 'Sign in to see your wallet',
              subtitle: 'Refunds and credits are kept with your account.',
              emoji: '👛',
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => const SignInPage()),
              ),
              child: const Text('Sign in'),
            ),
          ],
        ),
      ),
    );
  }
}

class _Skeleton extends StatelessWidget {
  const _Skeleton();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: const [
        ShimmerBox(height: 150, radius: 16),
        SizedBox(height: 24),
        ShimmerBox(width: 90, height: 16),
        SizedBox(height: 12),
        ShimmerBox(height: 64, radius: 12),
        SizedBox(height: 8),
        ShimmerBox(height: 64, radius: 12),
      ],
    );
  }
}
