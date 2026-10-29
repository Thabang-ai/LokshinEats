/// What this customer has already said about an order, and saying it.
///
/// Read before the card is drawn rather than after it is submitted: the API
/// refuses a second review of the same meal, and being offered a form that is
/// then refused is worse than waiting a moment for the answer.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/providers.dart';

/// The stars this customer gave, for one order.
class OrderReviews {
  const OrderReviews({this.storeRating, this.driverRating});

  final int? storeRating;
  final int? driverRating;

  static OrderReviews fromJson(Object? json) {
    int? ratingFor(String target) {
      if (json is! List) return null;
      for (final entry in json) {
        if (entry is Map<String, dynamic> && entry['target'] == target) {
          final rating = entry['rating'];
          if (rating is num) return rating.round();
        }
      }
      return null;
    }

    return OrderReviews(
      storeRating: ratingFor('store'),
      driverRating: ratingFor('driver'),
    );
  }
}

class OrderReviewsNotifier extends AsyncNotifier<OrderReviews> {
  OrderReviewsNotifier(this.orderId);

  final String orderId;

  @override
  Future<OrderReviews> build() async {
    final response = await ref
        .read(apiClientProvider)
        .get<OrderReviews>(
          '/api/v1/reviews/orders/$orderId',
          authenticated: true,
          decode: OrderReviews.fromJson,
        );
    return response.data;
  }

  /// Send the ratings, and keep what came back.
  ///
  /// One call for both: the API takes the kitchen and the driver together and
  /// records what it can, so a customer who rates both does not end up having
  /// rated one of them.
  Future<void> submit({
    int? storeRating,
    int? driverRating,
    String comment = '',
  }) async {
    final trimmed = comment.trim();

    final response = await ref
        .read(apiClientProvider)
        .post<OrderReviews>(
          '/api/v1/reviews/orders/$orderId',
          body: {
            if (storeRating != null)
              'store': {
                'rating': storeRating,
                if (trimmed.isNotEmpty) 'comment': trimmed,
              },
            if (driverRating != null)
              'driver': {
                'rating': driverRating,
                if (trimmed.isNotEmpty) 'comment': trimmed,
              },
          },
          decode: OrderReviews.fromJson,
        );

    // What the API recorded, not what was asked for: an order with no driver
    // keeps the kitchen rating and quietly drops the other.
    state = AsyncData(
      OrderReviews(
        storeRating: response.data.storeRating ?? storeRating,
        driverRating: response.data.driverRating,
      ),
    );
  }
}

final orderReviewsProvider = AsyncNotifierProvider.autoDispose
    .family<OrderReviewsNotifier, OrderReviews, String>(
      OrderReviewsNotifier.new,
    );
