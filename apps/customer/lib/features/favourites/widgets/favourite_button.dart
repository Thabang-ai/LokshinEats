/// The heart on a kitchen, as on the website's cards.
///
/// Hidden from signed-out browsers: there is nowhere to save a favourite
/// without an account, and a heart that does nothing is worse than no heart.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';

import '../providers/favourites_providers.dart';

class FavouriteButton extends ConsumerWidget {
  const FavouriteButton({
    super.key,
    required this.storeId,
    required this.storeName,
    this.onSurfaceImage = false,
  });

  final String storeId;
  final String storeName;

  /// True when the heart sits on a photo, where it needs its own backing to
  /// stay visible over whatever the kitchen uploaded.
  final bool onSurfaceImage;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(isSignedInProvider)) return const SizedBox.shrink();

    final theme = Theme.of(context);
    final isFavourite = ref.watch(isFavouriteProvider(storeId));

    final heart = Icon(
      isFavourite ? Icons.favorite_rounded : Icons.favorite_border_rounded,
      color: isFavourite
          ? theme.colorScheme.error
          : (onSurfaceImage
                ? Colors.white
                : theme.colorScheme.onSurfaceVariant),
      size: 22,
    );

    return Semantics(
      button: true,
      label: isFavourite
          ? 'Remove $storeName from favourites'
          : 'Save $storeName to favourites',
      child: Material(
        color: onSurfaceImage
            ? Colors.black.withValues(alpha: 0.35)
            : Colors.transparent,
        shape: const CircleBorder(),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => _toggle(context, ref),
          child: Padding(padding: const EdgeInsets.all(8), child: heart),
        ),
      ),
    );
  }

  Future<void> _toggle(BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    final wasFavourite = ref.read(isFavouriteProvider(storeId));

    try {
      await ref.read(favouritesProvider.notifier).toggle(storeId);
    } catch (_) {
      // The heart has already sprung back; say why, rather than leaving it
      // looking like the tap missed.
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            wasFavourite
                ? 'Could not remove that favourite. Please try again.'
                : 'Could not save that favourite. Please try again.',
          ),
        ),
      );
    }
  }
}
