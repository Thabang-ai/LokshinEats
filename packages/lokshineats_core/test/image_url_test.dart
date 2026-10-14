/// Turning stored image values into something a phone can load.
library;

import 'package:flutter_test/flutter_test.dart';

import 'package:lokshineats_core/config/app_config.dart';
import 'package:lokshineats_core/utils/image_url.dart';

void main() {
  group('resolveImageUrl', () {
    test('leaves an absolute URL alone', () {
      expect(
        resolveImageUrl('https://cdn.example/banner.jpeg'),
        'https://cdn.example/banner.jpeg',
      );
    });

    test('resolves a path the website serves', () {
      // The case that put "/img/kasi-kota-banner.jpeg" across a store card.
      expect(
        resolveImageUrl('/img/kasi-kota-banner.jpeg'),
        '${AppConfig.webBaseUrl}/img/kasi-kota-banner.jpeg',
      );
    });

    test('is not fooled by surrounding whitespace', () {
      expect(
        resolveImageUrl('  /img/minis-logo.jpeg  '),
        '${AppConfig.webBaseUrl}/img/minis-logo.jpeg',
      );
    });

    test('an emoji is not a URL', () {
      expect(resolveImageUrl('🍔'), isNull);
    });

    test('nothing to show', () {
      expect(resolveImageUrl(null), isNull);
      expect(resolveImageUrl(''), isNull);
      expect(resolveImageUrl('   '), isNull);
    });
  });

  group('isImagePlaceholder', () {
    test('an emoji stands in for a photo', () {
      expect(isImagePlaceholder('🍔'), isTrue);
      expect(isImagePlaceholder('🍛'), isTrue);
    });

    test('a photo is not a placeholder', () {
      expect(isImagePlaceholder('https://cdn.example/x.jpeg'), isFalse);
      expect(isImagePlaceholder('/img/kasi-kota-banner.jpeg'), isFalse);
    });

    test('a file name is a broken photo, not a decoration', () {
      // Showing these would print file names where the picture belongs.
      expect(isImagePlaceholder('kasi-kota-banner.jpeg'), isFalse);
      expect(isImagePlaceholder('img/banner.png'), isFalse);
      expect(isImagePlaceholder('Kasi Kota banner'), isFalse);
    });

    test('nothing stored', () {
      expect(isImagePlaceholder(null), isFalse);
      expect(isImagePlaceholder(''), isFalse);
    });
  });
}
