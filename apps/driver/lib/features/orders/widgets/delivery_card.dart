/// One delivery, as a card on a list.
///
/// Written to be read at arm's length in a moving vehicle or bright sun: the
/// pay and the pickup are the two things a driver decides on, so they are the
/// two things set in the largest type.
library;

import 'package:flutter/material.dart';

import 'package:lokshineats_core/theme/app_theme.dart';
import 'package:lokshineats_core/utils/money.dart';

import '../models/delivery.dart';

class DeliveryCard extends StatelessWidget {
  const DeliveryCard({
    super.key,
    required this.delivery,
    this.onTap,
    this.trailing,
  });

  final Delivery delivery;
  final VoidCallback? onTap;

  /// The action for this list — claiming it, or opening it.
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = StatusColors.of(context);

    return Card(
      clipBehavior: Clip.antiAlias,
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      delivery.storeName,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    formatRands(delivery.driverPayout),
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: status.success,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 2),
              Text(
                'You earn',
                textAlign: TextAlign.right,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),

              const SizedBox(height: 10),
              _Line(
                icon: Icons.storefront_outlined,
                text: delivery.status.label,
                emphasise: delivery.status.isWaitingForCollection,
              ),
              const SizedBox(height: 6),
              _Line(
                icon: Icons.location_on_outlined,
                text: delivery.address.oneLine,
              ),
              if (delivery.distanceKm != null) ...[
                const SizedBox(height: 6),
                _Line(
                  icon: Icons.route_outlined,
                  text: formatDistanceKm(delivery.distanceKm),
                ),
              ],

              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _Chip(
                    label:
                        '${delivery.itemCount} '
                        '${delivery.itemCount == 1 ? 'item' : 'items'}',
                  ),
                  if (delivery.isCash)
                    // The single most important thing about a cash order: the
                    // driver is carrying the kitchen's money, not just food.
                    _Chip(
                      label: 'Collect ${formatRands(delivery.total)} cash',
                      color: status.warning,
                    )
                  else
                    _Chip(label: 'Already paid', color: status.success),
                ],
              ),

              if (trailing != null) ...[
                const SizedBox(height: 14),
                SizedBox(width: double.infinity, child: trailing),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.icon, required this.text, this.emphasise = false});

  final IconData icon;
  final String text;
  final bool emphasise;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: theme.colorScheme.onSurfaceVariant),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: emphasise ? FontWeight.w700 : FontWeight.w400,
            ),
          ),
        ),
      ],
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, this.color});

  final String label;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tint = color ?? theme.colorScheme.primary;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: tint.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: theme.textTheme.labelMedium?.copyWith(
          color: tint,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
