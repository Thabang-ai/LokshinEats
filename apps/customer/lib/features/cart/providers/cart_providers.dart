/// Cart state, persisted on the device.
///
/// Kept locally rather than server-side: a basket is not an order, nothing in
/// it is binding, and a customer half-way through choosing should not need a
/// round trip per tap. It survives a restart because closing the app by
/// accident should not cost someone their basket.
library;

import 'dart:convert';

import 'package:flutter/foundation.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../stores/models/product.dart';
import '../models/cart.dart';

/// Deliberately not the web app's key.
///
/// The web cart lives in `localStorage` under `lokshineats-cart` and stores a
/// different shape — items with whole product objects, plus its own cached
/// subtotal, deliveryFee and total. Reading it here would mean trusting
/// money figures the server is supposed to decide, so the two baskets stay
/// separate.
const _storageKey = 'lokshineats-cart-v2';

/// What happened when something was added.
enum AddToCartResult {
  added,

  /// The basket belonged to a different kitchen and was replaced.
  replacedOtherStore,
}

class CartNotifier extends Notifier<Cart> {
  @override
  Cart build() {
    // Starts empty and fills in once storage has been read; the badge simply
    // appears a frame later rather than blocking the first screen.
    _restore();
    return Cart.empty;
  }

  Future<void> _restore() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_storageKey);
      if (raw == null) return;

      state = Cart.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (error, stack) {
      // Logged, not swallowed. A silent catch here hid a real failure: the web
      // build shipped without the shared_preferences plugin registered, every
      // read threw MissingPluginException, and the basket appeared to work
      // right up until someone reloaded the page.
      debugPrint('Could not restore the basket: $error\n$stack');
      state = Cart.empty;
    }
  }

  Future<void> _persist() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (state.isEmpty) {
        await prefs.remove(_storageKey);
      } else {
        await prefs.setString(_storageKey, jsonEncode(state.toJson()));
      }
    } catch (error, stack) {
      // Persistence is a convenience: failing to write must not break the
      // basket the customer is already looking at. It is still worth saying
      // so — see the note in _restore.
      debugPrint('Could not save the basket: $error\n$stack');
    }
  }

  /// Add an item, replacing the basket if it belongs to another kitchen.
  AddToCartResult add(
    Product product, {
    required String storeName,
    int quantity = 1,
  }) {
    final differentStore =
        state.storeId != null && state.storeId != product.storeId;

    final lines = differentStore ? <CartLine>[] : [...state.lines];

    final index = lines.indexWhere((line) => line.productId == product.id);
    if (index >= 0) {
      final existing = lines[index];
      lines[index] = existing.copyWith(quantity: existing.quantity + quantity);
    } else {
      lines.add(CartLine.fromProduct(product, quantity: quantity));
    }

    state = Cart(storeId: product.storeId, storeName: storeName, lines: lines);
    _persist();

    return differentStore
        ? AddToCartResult.replacedOtherStore
        : AddToCartResult.added;
  }

  /// Set a line's quantity. Zero or less removes it.
  void setQuantity(String productId, int quantity) {
    if (quantity <= 0) {
      remove(productId);
      return;
    }

    state = Cart(
      storeId: state.storeId,
      storeName: state.storeName,
      lines: [
        for (final line in state.lines)
          if (line.productId == productId)
            line.copyWith(quantity: quantity)
          else
            line,
      ],
    );
    _persist();
  }

  void remove(String productId) {
    final lines = state.lines
        .where((line) => line.productId != productId)
        .toList(growable: false);

    // Dropping the last line drops the kitchen too, so the next thing added
    // does not count as a store switch.
    state = lines.isEmpty
        ? Cart.empty
        : Cart(
            storeId: state.storeId,
            storeName: state.storeName,
            lines: lines,
          );
    _persist();
  }

  void setInstructions(String productId, String instructions) {
    state = Cart(
      storeId: state.storeId,
      storeName: state.storeName,
      lines: [
        for (final line in state.lines)
          if (line.productId == productId)
            line.copyWith(specialInstructions: instructions)
          else
            line,
      ],
    );
    _persist();
  }

  void clear() {
    state = Cart.empty;
    _persist();
  }
}

final cartProvider = NotifierProvider<CartNotifier, Cart>(CartNotifier.new);

/// Item count, for the badge.
final cartCountProvider = Provider<int>((ref) {
  return ref.watch(cartProvider).itemCount;
});
