/// Checkout: placing the order, then paying for it.
///
/// Modelled as an explicit sequence rather than one opaque call, because the
/// two halves fail differently and a customer needs to know which happened.
/// If the order is placed and the payment then fails, the order exists and is
/// unpaid — retrying payment is right, placing a second order is not.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/network/api_exception.dart';
import 'package:lokshineats_core/providers.dart';
import '../../cart/providers/cart_providers.dart';
import '../models/order.dart';
import '../repositories/order_repository.dart';

final orderRepositoryProvider = Provider<OrderRepository>((ref) {
  return OrderRepository(ref.watch(apiClientProvider));
});

/// Where checkout has got to.
sealed class CheckoutState {
  const CheckoutState();
}

class CheckoutIdle extends CheckoutState {
  const CheckoutIdle();
}

class CheckoutPlacing extends CheckoutState {
  const CheckoutPlacing();
}

class CheckoutPaying extends CheckoutState {
  const CheckoutPaying(this.order);
  final CustomerOrder order;
}

class CheckoutDone extends CheckoutState {
  const CheckoutDone(this.order);
  final CustomerOrder order;
}

/// The order exists but is not paid for. Retrying pays; it never re-places.
class CheckoutPaymentFailed extends CheckoutState {
  const CheckoutPaymentFailed(this.order, this.message);
  final CustomerOrder order;
  final String message;
}

class CheckoutFailed extends CheckoutState {
  const CheckoutFailed(this.error);
  final Object error;
}

class CheckoutController extends Notifier<CheckoutState> {
  @override
  CheckoutState build() => const CheckoutIdle();

  /// Place the order, then pay for it if it is not a cash order.
  Future<void> submit({
    required DeliveryAddress address,
    required PaymentMethod paymentMethod,
    required String customerPhone,
    double? cashAmount,
  }) async {
    final cart = ref.read(cartProvider);
    if (cart.isEmpty || cart.storeId == null) return;

    state = const CheckoutPlacing();

    final CustomerOrder order;
    try {
      order = await ref
          .read(orderRepositoryProvider)
          .placeOrder(
            cart: cart,
            address: address,
            paymentMethod: paymentMethod,
            customerPhone: customerPhone,
            cashAmount: paymentMethod == PaymentMethod.cash ? cashAmount : null,
          );
    } catch (error) {
      state = CheckoutFailed(error);
      return;
    }

    // The basket has become an order; keeping it would let a customer place
    // the same order twice by going back.
    ref.read(cartProvider.notifier).clear();

    // Cash is collected at the door. The server settles it when the driver
    // confirms delivery, so there is nothing to charge now.
    if (paymentMethod == PaymentMethod.cash) {
      state = CheckoutDone(order);
      return;
    }

    await _pay(order);
  }

  /// Retry payment for an order that was placed but not paid.
  Future<void> retryPayment() async {
    final current = state;
    if (current is! CheckoutPaymentFailed) return;
    await _pay(current.order);
  }

  Future<void> _pay(CustomerOrder order) async {
    state = CheckoutPaying(order);

    try {
      final attempt = await ref
          .read(orderRepositoryProvider)
          .initiatePayment(order.id);

      // Against the sandbox provider there is no hosted page to visit, so the
      // charge is resolved through its own endpoint. A live provider would
      // send the customer to a redirect instead.
      if (attempt.isSandbox && attempt.providerReference != null) {
        await ref
            .read(orderRepositoryProvider)
            .completeSandboxPayment(attempt.providerReference!);
      }

      final verified = await ref
          .read(orderRepositoryProvider)
          .verifyPayment(attempt.id);

      // Three outcomes, not two. `initiated` means the provider has not
      // confirmed anything yet, and calling that a success would show a paid
      // confirmation for an order nobody has charged for.
      if (!verified.succeeded) {
        state = CheckoutPaymentFailed(
          order,
          verified.failed
              ? verified.failureReason ??
                    'That payment was declined. Try another method.'
              : 'We have not had confirmation of your payment yet. '
                    'Your order is waiting — try paying again.',
        );
        return;
      }

      // Re-read the order so the confirmation shows the server's final state
      // — payment status included — rather than what was returned before the
      // charge settled.
      final settled = await ref
          .read(orderRepositoryProvider)
          .fetchOrder(order.id);

      state = CheckoutDone(settled);
    } catch (error) {
      // The order is placed and unpaid. Say which half failed, because the
      // remedy is to pay again — not to order again.
      state = CheckoutPaymentFailed(
        order,
        error is ApiException
            ? 'Your order was placed, but the payment did not go through. '
                  '${error.message}'
            : 'Your order was placed, but the payment did not go through.',
      );
    }
  }

  void reset() => state = const CheckoutIdle();
}

/// The payment methods the API can take right now.
///
/// At launch that is cash only: the one card provider built so far is a
/// sandbox that moves no real money, so it is switched off in production and
/// the API refuses card and EFT orders. Offering them here would only fail at
/// the last step of checkout. If the API cannot be asked, cash alone is the
/// safe answer - it is the one method that can never produce an order nobody
/// is able to pay for.
final paymentMethodsProvider = FutureProvider<List<PaymentMethod>>((ref) async {
  try {
    final response = await ref
        .read(apiClientProvider)
        .get<List<Object?>>(
          '/api/v1/config',
          decode: (json) =>
              ((json as Map<String, dynamic>?)?['paymentMethods'] as List?) ??
              const [],
        );

    final methods = [
      for (final wire in response.data)
        for (final method in PaymentMethod.values)
          if (method.wire == wire) method,
    ];
    return methods.isEmpty ? const [PaymentMethod.cash] : methods;
  } catch (_) {
    return const [PaymentMethod.cash];
  }
});

final checkoutControllerProvider =
    NotifierProvider<CheckoutController, CheckoutState>(CheckoutController.new);
