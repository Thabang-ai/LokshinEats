/// Rating the kitchen, and the person who brought it.
///
/// Everything a customer reads before ordering was written by whoever is
/// selling to them. A rating is the one part of a kitchen's page, and the
/// whole of a driver's record, that somebody else wrote - and it only means
/// anything if the somebody actually ate the food, which is why this appears
/// on a delivered order and nowhere else.
///
/// Asked once. What has already been said comes back from the API, so
/// reopening the order shows the stars given rather than the form again.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/network/api_exception.dart';
import 'package:lokshineats_core/theme/app_theme.dart';

import '../models/order.dart';
import '../providers/review_providers.dart';

class RateOrderCard extends ConsumerStatefulWidget {
  const RateOrderCard({super.key, required this.order});

  final CustomerOrder order;

  @override
  ConsumerState<RateOrderCard> createState() => _RateOrderCardState();
}

class _RateOrderCardState extends ConsumerState<RateOrderCard> {
  int _storeStars = 0;
  int _driverStars = 0;
  final _comment = TextEditingController();
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  bool get _hasDriver => (widget.order.driverId ?? '').isNotEmpty;

  Future<void> _send() async {
    setState(() {
      _sending = true;
      _error = null;
    });

    try {
      await ref
          .read(orderReviewsProvider(widget.order.id).notifier)
          .submit(
            storeRating: _storeStars == 0 ? null : _storeStars,
            driverRating: _driverStars == 0 ? null : _driverStars,
            comment: _comment.text.trim(),
          );
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'That did not send. Try again.');
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final already = ref.watch(orderReviewsProvider(widget.order.id));

    // While it is still loading, nothing: offering a form to somebody who has
    // already rated, and then refusing it, is worse than a moment's wait.
    //
    // A failure is different. It used to fall through the same hole and the
    // card simply never appeared - no stars, no error, nothing to tap, and
    // no way for anybody to tell whether the feature was there at all. If
    // the answer cannot be fetched, the form is shown: the worst case is
    // being offered it twice, and the API refuses the second one by name.
    final reviews = already.value ?? (already.hasError ? const OrderReviews() : null);
    if (reviews == null) return const SizedBox.shrink();

    final storeGiven = reviews.storeRating;
    final driverGiven = reviews.driverRating;
    final nothingLeftToRate =
        storeGiven != null && (!_hasDriver || driverGiven != null);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              nothingLeftToRate ? 'Thanks for rating' : 'How was it?',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              nothingLeftToRate
                  ? 'Other customers see this before they order.'
                  : 'Your rating is the one part of a kitchen page it did not '
                        'write itself.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 14),

            _Stars(
              label: widget.order.storeName.isEmpty
                  ? 'The kitchen'
                  : widget.order.storeName,
              given: storeGiven,
              value: _storeStars,
              onChanged: (stars) => setState(() => _storeStars = stars),
            ),

            if (_hasDriver) ...[
              const SizedBox(height: 10),
              _Stars(
                label: 'Your driver',
                given: driverGiven,
                value: _driverStars,
                onChanged: (stars) => setState(() => _driverStars = stars),
              ),
            ],

            if (!nothingLeftToRate) ...[
              const SizedBox(height: 12),
              TextField(
                controller: _comment,
                maxLength: 500,
                maxLines: 3,
                minLines: 1,
                decoration: const InputDecoration(
                  hintText: 'Anything you want to add? (optional)',
                  counterText: '',
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(
                  _error!,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.error,
                  ),
                ),
              ],
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _sending || (_storeStars == 0 && _driverStars == 0)
                      ? null
                      : _send,
                  child: _sending
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Send'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// One row of five stars, or the stars already given.
class _Stars extends StatelessWidget {
  const _Stars({
    required this.label,
    required this.given,
    required this.value,
    required this.onChanged,
  });

  final String label;

  /// Already rated: shown, and not changeable. A rating you can edit later is
  /// one the kitchen can talk you into editing.
  final int? given;
  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final shown = given ?? value;

    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        for (var star = 1; star <= 5; star++)
          IconButton(
            onPressed: given == null ? () => onChanged(star) : null,
            visualDensity: VisualDensity.compact,
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(minWidth: 34, minHeight: 34),
            tooltip: given == null ? '$star out of 5' : null,
            icon: Icon(
              star <= shown ? Icons.star_rounded : Icons.star_border_rounded,
              color: star <= shown
                  ? AppColors.brand
                  : theme.colorScheme.onSurfaceVariant,
            ),
          ),
      ],
    );
  }
}
