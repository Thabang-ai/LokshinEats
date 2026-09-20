/// Placing and paying for orders, via the API.
///
/// Note what `placeOrder` sends: a store id, product ids with quantities, an
/// address, a payment method and a phone number. No prices, no total, no
/// payment status, no delivery code. The API's schema is strict, so sending
/// any of those is a validation error rather than a silently ignored field —
/// which is exactly how the old web checkout used to work, and why it could
/// mint a paid order at a price it chose.
library;

import 'package:lokshineats_core/network/api_client.dart';
import '../../cart/models/cart.dart';
import '../models/order.dart';

class OrderRepository {
  const OrderRepository(this._client);

  final ApiClient _client;

  /// Place an order. The server prices it and returns what is owed.
  Future<CustomerOrder> placeOrder({
    required Cart cart,
    required DeliveryAddress address,
    required PaymentMethod paymentMethod,
    required String customerPhone,
    double? cashAmount,
  }) async {
    final response = await _client.post<CustomerOrder>(
      '/api/v1/orders',
      body: {
        'storeId': cart.storeId,
        'items': [
          for (final line in cart.lines)
            {
              'productId': line.productId,
              'quantity': line.quantity,
              if (line.specialInstructions != null &&
                  line.specialInstructions!.trim().isNotEmpty)
                'specialInstructions': line.specialInstructions!.trim(),
            },
        ],
        'deliveryAddress': address.toJson(),
        'paymentMethod': paymentMethod.wire,
        'customerPhone': customerPhone.replaceAll(' ', ''),
        // A hint so the driver brings change, never a price. The API rejects
        // it on a card order and rejects an amount below the total.
        'cashAmount': ?cashAmount,
      },
      decode: (json) => CustomerOrder.fromJson(json! as Map<String, dynamic>),
    );

    return response.data;
  }

  /// The signed-in customer's orders, newest first, one page at a time.
  ///
  /// Pass the previous page's [OrdersPage.nextCursor] to continue. The server
  /// scopes the query to the caller's own uid, so there is no customer id to
  /// send — and no way to ask for someone else's.
  Future<OrdersPage> fetchMyOrders({String? cursor, int limit = 20}) async {
    final response = await _client.get<List<CustomerOrder>>(
      '/api/v1/orders/mine',
      authenticated: true,
      query: {
        'limit': '$limit',
        'cursor': ?cursor,
      },
      decode: (json) => decodeList(json, CustomerOrder.fromJson),
    );

    return OrdersPage(orders: response.data, nextCursor: response.nextCursor);
  }

  Future<CustomerOrder> fetchOrder(String orderId) async {
    final response = await _client.get<CustomerOrder>(
      '/api/v1/orders/$orderId',
      authenticated: true,
      decode: (json) => CustomerOrder.fromJson(json! as Map<String, dynamic>),
    );

    return response.data;
  }

  /// Start a charge. The amount comes from the order, not from this app.
  Future<PaymentAttempt> initiatePayment(String orderId) async {
    final response = await _client.post<Map<String, dynamic>>(
      '/api/v1/payments',
      body: {'orderId': orderId},
      decode: (json) => json! as Map<String, dynamic>,
    );

    return PaymentAttempt.fromJson(response.data, meta: response.meta);
  }

  /// Ask the server to check with the provider and settle if it succeeded.
  ///
  /// Idempotent, so it is safe to call again after returning from a redirect
  /// or retrying a flaky connection.
  Future<PaymentAttempt> verifyPayment(String paymentId) async {
    final response = await _client.post<Map<String, dynamic>>(
      '/api/v1/payments/$paymentId/verify',
      decode: (json) => json! as Map<String, dynamic>,
    );

    return PaymentAttempt.fromJson(response.data);
  }

  /// What cancelling this order would cost right now. Changes nothing.
  Future<CancellationPreview> previewCancellation(String orderId) async {
    final response = await _client.get<CancellationPreview>(
      '/api/v1/orders/$orderId/cancellation-preview',
      authenticated: true,
      decode: (json) =>
          CancellationPreview.fromJson(json! as Map<String, dynamic>),
    );

    return response.data;
  }

  /// Cancel an order at the cost the customer was shown.
  ///
  /// [expectedStage] is the stage from the preview. If the order has moved on
  /// since — a driver collected the food while the confirmation was open —
  /// the API refuses with a conflict instead of settling at a price the
  /// customer never agreed to.
  Future<CustomerOrder> cancelOrder(
    String orderId, {
    required String expectedStage,
  }) async {
    final response = await _client.patch<CustomerOrder>(
      '/api/v1/orders/$orderId/status',
      body: {'status': 'cancelled', 'expectedStage': expectedStage},
      decode: (json) => CustomerOrder.fromJson(json! as Map<String, dynamic>),
    );

    return response.data;
  }

  /// Resolve a sandbox charge.
  ///
  /// Stands in for the customer finishing payment on a real provider's page.
  /// Only exists while the API runs its sandbox provider; against a live one
  /// this route returns 404 and the app follows the provider's redirect
  /// instead.
  Future<void> completeSandboxPayment(String reference) async {
    await _client.post<void>(
      '/api/v1/payments/sandbox/$reference/complete',
      body: {'outcome': 'succeed'},
      decode: (_) {},
    );
  }
}

/// One page of a customer's orders.
class OrdersPage {
  const OrdersPage({required this.orders, required this.nextCursor});

  final List<CustomerOrder> orders;

  /// Pass back to [OrderRepository.fetchMyOrders] for the next page; null
  /// when there are no more.
  final String? nextCursor;
}
