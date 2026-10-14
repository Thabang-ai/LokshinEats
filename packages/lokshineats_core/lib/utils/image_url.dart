/// Turning stored image values into URLs a phone can actually load.
///
/// Photos reach us in three shapes, because the vendor pages have written them
/// three ways over time:
///
///   https://.../banner.jpeg   an absolute URL - usable as it is
///   /img/kasi-kota.jpeg       a path the website serves from its own origin
///   🍔                        an emoji standing in for a missing photo
///
/// A browser resolves the second against the page it is on. A phone has no
/// page, so unless it is resolved here the app treats a real photo as "no
/// photo" and shows the stored text where the picture belongs - which is
/// exactly what the store cards did: a banner reading "/img/kasi-kota-...".
library;

import '../config/app_config.dart';

/// The absolute URL for [value], or null when it is not an image reference.
String? resolveImageUrl(String? value) {
  final raw = value?.trim();
  if (raw == null || raw.isEmpty) return null;

  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;

  // Site-relative: the website serves these from its public folder.
  if (raw.startsWith('/')) return '${AppConfig.webBaseUrl}$raw';

  return null;
}

/// Whether [value] is a stand-in to show instead of a photo, such as an emoji.
///
/// Deliberately not "anything that is not a URL": a path we failed to resolve
/// is a broken photo, not a decoration, and rendering it would put file names
/// on the screen.
bool isImagePlaceholder(String? value) {
  final raw = value?.trim();
  if (raw == null || raw.isEmpty) return false;
  if (resolveImageUrl(raw) != null) return false;
  // Emoji are a couple of runes; file names and stray URLs are not.
  return raw.runes.length <= 4 && !raw.contains('/') && !raw.contains('.');
}
