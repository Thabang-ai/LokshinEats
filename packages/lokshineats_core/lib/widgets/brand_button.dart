/// The button the website calls `.premium-button`.
///
/// Not a colour but a gradient - `linear-gradient(135deg, #FF4500, #FF6B35,
/// #FF8B5A)` - under an orange glow. It is the loudest thing on the site's
/// front page ("Find Food") and on every page that asks for the one action
/// that matters, and a flat orange rectangle in its place is the clearest
/// way an app screen stops looking like the site.
///
/// A plain [FilledButton] cannot carry a gradient: its background is one
/// colour, and the theme can only set colours. So the gradient lives here,
/// in a widget used where the site uses that class, while every ordinary
/// button stays a themed [FilledButton] and picks up the same glow.
library;

import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

class BrandButton extends StatelessWidget {
  const BrandButton({
    super.key,
    required this.onPressed,
    required this.child,
    this.icon,
    this.height = 56,
  });

  /// Null disables it, as with any button. A disabled one loses the gradient
  /// and the glow, because a button that still glows looks pressable.
  final VoidCallback? onPressed;
  final Widget child;
  final Widget? icon;
  final double height;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;

    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppTheme.radius),
        gradient: enabled
            ? const LinearGradient(
                // 135deg on the web: top-left to bottom-right.
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  AppColors.brand,
                  AppColors.brandLight,
                  Color(0xFFFF8B5A),
                ],
                stops: [0, 0.5, 1],
              )
            : null,
        color: enabled
            ? null
            : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.12),
        boxShadow: enabled
            ? const [
                BoxShadow(
                  color: Color(0x4DFF6B35),
                  blurRadius: 15,
                  offset: Offset(0, 4),
                ),
              ]
            : null,
      ),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTap: onPressed,
          borderRadius: BorderRadius.circular(AppTheme.radius),
          child: SizedBox(
            height: height,
            child: Center(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (icon != null) ...[icon!, const SizedBox(width: 8)],
                  DefaultTextStyle.merge(
                    style: TextStyle(
                      color: enabled
                          ? Colors.white
                          : Theme.of(
                              context,
                            ).colorScheme.onSurface.withValues(alpha: 0.38),
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                    ),
                    child: child,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
