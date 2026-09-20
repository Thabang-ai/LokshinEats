/// What this driver is carrying, and what they have finished.
///
/// The active ones come first and are the point of the screen: a driver
/// usually has one, occasionally two, and needs to get back to whichever they
/// are in the middle of without hunting for it.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/widgets/async_states.dart';

import '../providers/delivery_providers.dart';
import '../widgets/delivery_card.dart';

class MyDeliveriesPage extends ConsumerWidget {
  const MyDeliveriesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final mine = ref.watch(myDeliveriesProvider);
    final notifier = ref.read(myDeliveriesProvider.notifier);

    return mine.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => ErrorState(
        error: error,
        onRetry: () => ref.invalidate(myDeliveriesProvider),
      ),
      data: (state) {
        final active = activeOf(state);
        final finished = finishedOf(state);

        return RefreshIndicator(
          onRefresh: notifier.refresh,
          child: state.isEmpty
              ? ListView(
                  padding: const EdgeInsets.fromLTRB(24, 80, 24, 24),
                  children: const [
                    EmptyState(
                      title: 'Nothing on the go',
                      subtitle:
                          'Claim a delivery from Available and it shows up '
                          'here.',
                      emoji: '📦',
                    ),
                  ],
                )
              : ListView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                  children: [
                    if (active.isNotEmpty) ...[
                      Text(
                        'On the go',
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 10),
                      for (final delivery in active)
                        DeliveryCard(delivery: delivery),
                    ],
                    if (finished.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Text(
                        'Finished',
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 10),
                      for (final delivery in finished)
                        DeliveryCard(delivery: delivery),
                    ],
                  ],
                ),
        );
      },
    );
  }
}
