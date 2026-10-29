/// The LokshinEats name, the way the website writes it.
///
/// The phone header used to set the name on its own at headline size beside
/// four buttons. On a 360dp phone it had nowhere to go and wrapped - "LokshinE
/// / ats" - across two lines, over the tagline below it. One line that cannot
/// wrap, with the badge the website uses, says the same thing and fits.
library;

import 'package:flutter/material.dart';

class BrandMark extends StatelessWidget {
  const BrandMark({
    super.key,
    this.logoSize = 36,
    this.fontSize = 20,
    this.showName = true,
  });

  final double logoSize;
  final double fontSize;

  /// False where the name is already on screen and only the badge is wanted.
  final bool showName;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final logo = Image.asset(
      'assets/logo.png',
      package: 'lokshineats_core',
      width: logoSize,
      height: logoSize,
      fit: BoxFit.contain,
      // A missing asset is a build problem, not something a customer should
      // see a grey box for; the name alone still reads as the brand.
      errorBuilder: (_, _, _) => const SizedBox.shrink(),
    );

    if (!showName) return logo;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        logo,
        const SizedBox(width: 8),
        Flexible(
          child: Text.rich(
            TextSpan(
              children: [
                const TextSpan(text: 'Lokshin'),
                TextSpan(
                  text: 'Eats',
                  style: TextStyle(color: theme.colorScheme.primary),
                ),
              ],
            ),
            maxLines: 1,
            softWrap: false,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.titleLarge?.copyWith(
              fontSize: fontSize,
              fontWeight: FontWeight.w800,
              height: 1.1,
              color: theme.colorScheme.onSurface,
            ),
          ),
        ),
      ],
    );
  }
}
