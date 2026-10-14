/// Photos on store cards and menu items.
///
/// Vendors' photos are stored as paths the website serves ("/img/x.jpeg").
/// The app used to treat those as "not a photo" and render the stored text
/// instead, so store cards read "/img/kasi-kota-banner.jpeg" across the
/// banner. These check the model turns such a value into something loadable,
/// and that a dish with no photo still gets a plate rather than nothing.
library;

import 'package:flutter_test/flutter_test.dart';

import 'package:lokshineats_core/config/app_config.dart';

import 'package:lokshineats_customer/features/stores/models/product.dart';
import 'package:lokshineats_customer/features/stores/models/store.dart';

Store storeWithImage(String? image) => Store(
  id: 'store-1',
  name: 'Kasi Kota',
  description: 'Kotas made right.',
  cuisine: 'Kota Specialist',
  address: '12 Vilakazi Street',
  city: 'Soweto',
  categories: const ['Kota'],
  image: image,
  rating: 4.8,
  reviewCount: 6,
  deliveryTime: '30-45 min',
  deliveryFee: 15,
  minOrderAmount: 30,
  isOpen: true,
);

void main() {
  group('a kitchen photo', () {
    test('a path the website serves becomes a loadable URL', () {
      final store = storeWithImage('/img/kasi-kota-banner.jpeg');

      expect(store.hasPhoto, isTrue);
      expect(
        store.photoUrl,
        '${AppConfig.webBaseUrl}/img/kasi-kota-banner.jpeg',
      );
    });

    test('an absolute URL is used as it is', () {
      final store = storeWithImage('https://cdn.example/banner.jpeg');
      expect(store.photoUrl, 'https://cdn.example/banner.jpeg');
    });

    test('an emoji is shown as the stand-in it is', () {
      final store = storeWithImage('🍔');

      expect(store.hasPhoto, isFalse);
      expect(store.placeholderEmoji, '🍔');
    });

    test('a file name never ends up on screen as text', () {
      final store = storeWithImage('kasi-kota-banner.jpeg');

      expect(store.hasPhoto, isFalse);
      expect(store.placeholderEmoji, '🍽️');
    });

    test('no photo at all', () {
      expect(storeWithImage(null).hasPhoto, isFalse);
      expect(storeWithImage(null).placeholderEmoji, '🍽️');
    });
  });

  group('a dish photo', () {
    Product dish(Object? image) => Product.fromJson({
      'id': 'p1',
      'storeId': 'store-1',
      'name': 'Deluxe kota',
      'description': 'Fully loaded.',
      'price': 60,
      'category': 'Kota',
      'image': image,
    });

    test('keeps a website path instead of discarding it', () {
      // Parsing used to drop anything not starting with http, so these dishes
      // could never show a photo however the menu was built.
      expect(
        dish('/img/kasi-kota-deluxe-meal.jpeg').photoUrl,
        '${AppConfig.webBaseUrl}/img/kasi-kota-deluxe-meal.jpeg',
      );
    });

    test('keeps an absolute URL', () {
      expect(
        dish('https://cdn.example/deluxe.jpeg').photoUrl,
        'https://cdn.example/deluxe.jpeg',
      );
    });

    test('no photo is null, not an empty string', () {
      expect(dish(null).photoUrl, isNull);
      expect(dish('').photoUrl, isNull);
      expect(dish(42).photoUrl, isNull);
    });
  });
}
