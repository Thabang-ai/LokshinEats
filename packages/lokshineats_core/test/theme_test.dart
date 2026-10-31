/// The theme's typeface.
///
/// A font bundled in a package is only reachable under
/// `packages/<name>/<family>`. Written as plain 'Geist' it resolves to
/// nothing, every screen falls back to Roboto, and the only symptom is that
/// the app does not look like the site - which is what this is here to stop.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:lokshineats_core/theme/app_theme.dart';

void main() {
  test('every app renders in the site\'s font', () {
    expect(AppTheme.light.textTheme.bodyMedium?.fontFamily, AppTheme.fontFamily);
    expect(AppTheme.fontFamily, startsWith('packages/lokshineats_core/'));
  });

  test('and the bundled family is the one the site uses', () {
    expect(AppTheme.fontFamily, endsWith('Geist'));
  });
}
