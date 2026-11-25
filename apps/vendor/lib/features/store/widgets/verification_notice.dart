/// What a kitchen that cannot trade yet is told.
///
/// LokshinEats reviews a kitchen before it goes on the platform - the same
/// gate a driver has had since October. Until that decision, no order can
/// reach this kitchen and the open switch is refused by the API.
///
/// The app used to say none of that. A vendor saw an empty order queue, an
/// open switch that answered "Could not change that. Try again.", and no way
/// to find out why. This is the explanation that was missing.
///
/// It deliberately does not block the app. A vendor waiting for a decision
/// can still build their menu, fix their address and upload photographs, and
/// the API lets them: getting ready is not trading, and making somebody wait
/// to do it helps nobody.
library;

import 'package:flutter/material.dart';

import 'package:lokshineats_core/theme/app_theme.dart';

import '../models/store.dart';

class VerificationNotice extends StatelessWidget {
  const VerificationNotice({
    super.key,
    required this.store,
    this.compact = false,
  });

  final Store store;

  /// A single line, for sitting above something else.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    if (store.verification.mayTrade) return const SizedBox.shrink();

    final theme = Theme.of(context);
    final status = StatusColors.of(context);
    final rejected = store.verification == StoreVerification.rejected;
    final tone = rejected ? status.danger : status.warning;

    final title = rejected
        ? 'LokshinEats turned this kitchen down'
        : 'LokshinEats is checking your kitchen';

    final body = rejected
        ? store.verificationReason ??
              'Update your details and we will look again.'
        : 'Nobody can order from you until that is done. You can still set '
              'up your menu, your photographs and your details while you '
              'wait.';

    if (compact) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: tone.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(AppTheme.radius),
        ),
        child: Row(
          children: [
            Icon(
              rejected ? Icons.error_outline : Icons.hourglass_top_rounded,
              color: tone,
              size: 18,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                title,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: tone,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(24, 48, 24, 24),
      children: [
        Icon(
          rejected ? Icons.error_outline : Icons.hourglass_top_rounded,
          size: 56,
          color: tone,
        ),
        const SizedBox(height: 16),
        Text(
          title,
          textAlign: TextAlign.center,
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 10),
        Text(
          body,
          textAlign: TextAlign.center,
          style: theme.textTheme.bodyMedium?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        if (rejected && store.verificationReason != null) ...[
          const SizedBox(height: 10),
          Text(
            'Change what they asked for on the Kitchen tab, and we will '
            'look at it again.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ],
    );
  }
}
