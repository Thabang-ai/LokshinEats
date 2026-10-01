/// The earnings screen the driver and vendor apps share.
///
/// Three things, in the order a person asks them: where do I stand with
/// LokshinEats, what did I make this week, and what happened on each order.
/// The layout is the same for a driver and a kitchen; the words are not, so
/// each app supplies its own [EarningsWording].
///
/// The balance can be negative, and the screen says what that means rather
/// than showing a bare minus sign: on cash orders the driver or kitchen is
/// holding money that is partly LokshinEats', so they owe it until card
/// earnings cover it.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../theme/app_theme.dart';
import '../utils/money.dart';
import '../widgets/async_states.dart';
import 'earnings.dart';
import 'wallet.dart';
import 'wallet_providers.dart';

/// The words that differ between a driver's earnings and a kitchen's.
class EarningsWording {
  const EarningsWording({
    required this.oweExplanation,
    required this.jobs,
    required this.entryLabel,
    required this.emptyTitle,
    required this.emptySubtitle,
    this.pendingNote,
  });

  /// Under a negative balance: why they owe it, and how it clears.
  final String oweExplanation;

  /// "3 deliveries", "1 order".
  final String Function(int count) jobs;

  /// What to call one entry, from this person's point of view.
  final String Function(LedgerEntry entry) entryLabel;

  final String emptyTitle;
  final String emptySubtitle;

  /// Under the balance when some of it is still pending, or null if this
  /// person never has pending earnings.
  final String Function(double pending)? pendingNote;
}

class EarningsView extends ConsumerStatefulWidget {
  const EarningsView({super.key, required this.wording});

  final EarningsWording wording;

  @override
  ConsumerState<EarningsView> createState() => _EarningsViewState();
}

class _EarningsViewState extends ConsumerState<EarningsView> {
  static const _week = Duration(days: 7);
  ProviderSubscription<AsyncValue<WalletState>>? _firstLoad;

  @override
  void initState() {
    super.initState();
    // Once the first page is in, keep reading until the history covers the
    // week, so "this week" is a week and not a page.
    _firstLoad = ref.listenManual(walletProvider, (previous, next) {
      if (previous?.hasValue != true && next.hasValue) {
        unawaited(ref.read(walletProvider.notifier).loadBack(_week));
      }
    }, fireImmediately: true);
  }

  @override
  void dispose() {
    _firstLoad?.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final wallet = ref.watch(walletProvider);

    return wallet.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => ErrorState(
        error: error,
        onRetry: () => ref.invalidate(walletProvider),
      ),
      data: (state) {
        final groups = groupByOrder(state.entries);
        final week = summarise(
          state.entries,
          since: DateTime.now().subtract(_week),
          historyComplete: !state.hasMore,
        );

        return RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(walletProvider);
            await ref.read(walletProvider.future);
          },
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            children: [
              _BalanceCard(wallet: state.wallet, wording: widget.wording),
              const SizedBox(height: 12),
              _WeekCard(summary: week, wording: widget.wording),
              const SizedBox(height: 20),
              if (groups.isEmpty)
                EmptyState(
                  title: widget.wording.emptyTitle,
                  subtitle: widget.wording.emptySubtitle,
                  emoji: '💰',
                )
              else ...[
                Text(
                  'By order',
                  style: Theme.of(
                    context,
                  ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 10),
                for (final group in groups)
                  _OrderRow(group: group, wording: widget.wording),
                if (state.hasMore)
                  Center(
                    child: TextButton(
                      onPressed: state.isLoadingMore
                          ? null
                          : () => ref.read(walletProvider.notifier).loadMore(),
                      child: Text(
                        state.loadMoreFailed
                            ? 'Could not load more. Try again'
                            : 'Show older',
                      ),
                    ),
                  ),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _BalanceCard extends StatelessWidget {
  const _BalanceCard({required this.wallet, required this.wording});

  final Wallet wallet;
  final EarningsWording wording;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = StatusColors.of(context);
    final total = wallet.totalBalance;
    // Half a cent either way is nothing, not a tiny debt.
    final owes = total < -0.005;
    final tint = owes ? status.warning : status.success;

    return Container(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
      decoration: BoxDecoration(
        color: tint.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            owes ? 'You owe LokshinEats' : 'LokshinEats owes you',
            style: theme.textTheme.titleSmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            formatRands(total.abs()),
            style: theme.textTheme.headlineMedium?.copyWith(
              fontWeight: FontWeight.w800,
              color: tint,
            ),
          ),
          if (owes) ...[
            const SizedBox(height: 6),
            Text(wording.oweExplanation, style: theme.textTheme.bodyMedium),
          ],
          if (wording.pendingNote != null && wallet.pendingBalance > 0.005) ...[
            const SizedBox(height: 6),
            Text(
              wording.pendingNote!(wallet.pendingBalance),
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _WeekCard extends StatelessWidget {
  const _WeekCard({required this.summary, required this.wording});

  final EarningsSummary summary;
  final EarningsWording wording;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 14, 18, 14),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    summary.complete ? 'Last 7 days' : 'Last 7 days, so far',
                    style: theme.textTheme.titleSmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    wording.jobs(summary.orders),
                    style: theme.textTheme.bodyMedium,
                  ),
                ],
              ),
            ),
            Text(
              formatRands(summary.earned),
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OrderRow extends StatelessWidget {
  const _OrderRow({required this.group, required this.wording});

  final OrderEarnings group;
  final EarningsWording wording;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = StatusColors.of(context);
    final net = group.net;
    final muted = theme.colorScheme.onSurfaceVariant;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    group.reference == null
                        ? wording.entryLabel(group.entries.first)
                        : 'Order #${group.reference}',
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                Text(
                  _signed(net),
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: net < -0.005 ? status.warning : status.success,
                  ),
                ),
              ],
            ),
            if (group.when != null)
              Text(
                _when(group.when!),
                style: theme.textTheme.bodySmall?.copyWith(color: muted),
              ),
            // With more than one thing on the order, say what each was: that
            // is where a cash order's net makes sense.
            if (group.orderId != null && group.entries.length > 1) ...[
              const SizedBox(height: 6),
              for (final entry in group.entries.reversed)
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        wording.entryLabel(entry),
                        style: theme.textTheme.bodySmall,
                      ),
                    ),
                    Text(
                      _signed(entry.amount),
                      style: theme.textTheme.bodySmall?.copyWith(color: muted),
                    ),
                  ],
                ),
            ] else if (group.orderId != null)
              Text(
                wording.entryLabel(group.entries.first),
                style: theme.textTheme.bodySmall,
              ),
          ],
        ),
      ),
    );
  }

  static String _signed(double amount) {
    if (amount.abs() < 0.005) return formatRands(0);
    return '${amount < 0 ? '−' : '+'}${formatRands(amount.abs())}';
  }

  static String _when(DateTime at) {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    final hh = at.hour.toString().padLeft(2, '0');
    final mm = at.minute.toString().padLeft(2, '0');
    return '${at.day} ${months[at.month - 1]}, $hh:$mm';
  }
}
