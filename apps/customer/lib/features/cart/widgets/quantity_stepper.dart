/// A minus / count / plus control for a basket line.
///
/// The minus button becomes a bin at a quantity of one, so removing a line is
/// the natural end of decrementing rather than a separate control to hunt for.
library;

import 'package:flutter/material.dart';

class QuantityStepper extends StatelessWidget {
  const QuantityStepper({
    super.key,
    required this.quantity,
    required this.onChanged,
    this.max = 50,
  });

  final int quantity;

  /// Called with the new quantity. Zero means the line should go.
  final ValueChanged<int> onChanged;

  /// The API caps a line at 50, so the plus button stops there rather than
  /// letting a customer build a basket the server will reject.
  final int max;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final removing = quantity <= 1;

    return Container(
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            onPressed: () => onChanged(quantity - 1),
            visualDensity: VisualDensity.compact,
            icon: Icon(
              removing ? Icons.delete_outline_rounded : Icons.remove_rounded,
              size: 20,
              color: removing ? scheme.error : scheme.onSurface,
            ),
            tooltip: removing ? 'Remove' : 'One fewer',
          ),
          SizedBox(
            width: 24,
            child: Text(
              '$quantity',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          IconButton(
            onPressed: quantity >= max ? null : () => onChanged(quantity + 1),
            visualDensity: VisualDensity.compact,
            icon: const Icon(Icons.add_rounded, size: 20),
            tooltip: 'One more',
          ),
        ],
      ),
    );
  }
}
