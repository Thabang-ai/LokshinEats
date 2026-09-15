/// Material 3 theming, light and dark.
///
/// The palette continues the brand the web app already uses — the orange in
/// `public/manifest.json` — rather than inventing a second identity for the
/// same product. Around it sit warm earth tones: a clay red, a deep charcoal
/// that reads as near-black without being flat, and a maize accent for
/// highlights. Warm neutrals throughout, because a food app rendered in cool
/// grey makes the food look worse.
///
/// Both schemes are derived from the same seed so light and dark stay
/// recognisably the same product, with the handful of key roles pinned
/// explicitly so the seed algorithm cannot drift the brand colour.
library;

import 'package:flutter/material.dart';

class AppColors {
  const AppColors._();

  /// LokshinEats orange — the existing brand colour.
  static const Color brand = Color(0xFFFF6600);

  /// Clay, for secondary emphasis.
  static const Color clay = Color(0xFFB5432A);

  /// Maize, used sparingly for accents like ratings.
  static const Color maize = Color(0xFFF2B233);

  /// Warm near-black, for text and dark surfaces.
  static const Color charcoal = Color(0xFF1C1512);

  /// Warm off-white page background.
  static const Color sand = Color(0xFFFDF8F4);

  /// Success and failure, warmed slightly to sit with the palette.
  static const Color leaf = Color(0xFF2E7D4F);
  static const Color chilli = Color(0xFFC0392B);
}

/// Status colours that stay readable in both themes.
///
/// [AppColors.leaf], [AppColors.chilli] and [AppColors.maize] are brand
/// colours, and as text they failed WCAG AA: in dark mode leaf measured
/// 3.3:1 and chilli 3.1:1 against the card surface, and in light mode maize
/// measured 1.9:1 on white. Every value here was checked to reach at least
/// 4.5:1 both on the card surface and on a 15% tint of itself, so the same
/// colour works as plain text and inside a status chip.
class StatusColors {
  const StatusColors._({
    required this.success,
    required this.danger,
    required this.warning,
  });

  /// Delivered, paid.
  final Color success;

  /// Failed, could not refresh.
  final Color danger;

  /// Waiting on something outside the customer's control.
  final Color warning;

  static const StatusColors _light = StatusColors._(
    success: Color(0xFF256B42),
    danger: Color(0xFFB03427),
    warning: Color(0xFF8A5A00),
  );

  static const StatusColors _dark = StatusColors._(
    success: Color(0xFF7BD19E),
    danger: Color(0xFFFF8A7A),
    warning: Color(0xFFF2B233),
  );

  static StatusColors of(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? _dark : _light;
}

class AppTheme {
  const AppTheme._();

  /// Corner radius used across cards, sheets and inputs.
  static const double radius = 16;

  static ThemeData get light => _build(Brightness.light);
  static ThemeData get dark => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final isLight = brightness == Brightness.light;

    final scheme =
        ColorScheme.fromSeed(
          seedColor: AppColors.brand,
          brightness: brightness,
        ).copyWith(
          // Pinned so the brand orange survives the seed algorithm, which
          // otherwise shifts it for contrast.
          primary: isLight ? AppColors.brand : const Color(0xFFFF9147),
          onPrimary: isLight ? Colors.white : AppColors.charcoal,
          secondary: isLight ? AppColors.clay : const Color(0xFFE58B72),
          tertiary: AppColors.maize,
          error: AppColors.chilli,
          surface: isLight ? Colors.white : const Color(0xFF241C18),
          onSurface: isLight ? AppColors.charcoal : const Color(0xFFF2E9E4),
        );

    final base = ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: isLight ? AppColors.sand : AppColors.charcoal,
      splashFactory: InkSparkle.splashFactory,
    );

    return base.copyWith(
      appBarTheme: AppBarTheme(
        backgroundColor: isLight ? AppColors.sand : AppColors.charcoal,
        foregroundColor: scheme.onSurface,
        elevation: 0,
        scrolledUnderElevation: 1,
        centerTitle: false,
        titleTextStyle: base.textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w700,
          color: scheme.onSurface,
        ),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        margin: EdgeInsets.zero,
        color: scheme.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radius),
          // A hairline border instead of a shadow: on a warm background a
          // drop shadow muddies, while a border keeps cards crisp in both
          // light and dark.
          side: BorderSide(color: scheme.outlineVariant.withValues(alpha: 0.5)),
        ),
        clipBehavior: Clip.antiAlias,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(52),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radius),
          ),
          textStyle: const TextStyle(
            fontWeight: FontWeight.w700,
            fontSize: 16,
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: isLight ? Colors.white : const Color(0xFF2E2420),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radius),
          borderSide: BorderSide(color: scheme.outlineVariant),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radius),
          borderSide: BorderSide(color: scheme.outlineVariant),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radius),
          borderSide: BorderSide(color: scheme.primary, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 14,
        ),
      ),
      chipTheme: base.chipTheme.copyWith(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(999),
        ),
        side: BorderSide(color: scheme.outlineVariant),
      ),
      dividerTheme: DividerThemeData(
        color: scheme.outlineVariant.withValues(alpha: 0.6),
        space: 1,
        thickness: 1,
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radius),
        ),
      ),
    );
  }
}
