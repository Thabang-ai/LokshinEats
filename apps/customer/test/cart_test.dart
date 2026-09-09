/// Tests for the basket and for checkout.
///
/// The basket tests are ordinary unit tests. The checkout test is the one that
/// matters: it drives the whole sequence — place, initiate, resolve the
/// sandbox charge, verify, re-read — against a fake HTTP layer, and asserts
/// what the app *sends*. An order request that carried a price would be the
/// return of the bug this whole migration exists to close, and it would pass
/// every other test in this repository.
library;

import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:lokshineats_customer/core/network/api_client.dart';
import 'package:lokshineats_customer/core/network/api_exception.dart';
import 'package:lokshineats_customer/core/providers.dart';
import 'package:lokshineats_customer/features/cart/models/cart.dart';
import 'package:lokshineats_customer/features/cart/providers/cart_providers.dart';
import 'package:lokshineats_customer/features/orders/models/order.dart';
import 'package:lokshineats_customer/features/orders/providers/checkout_providers.dart';
import 'package:lokshineats_customer/features/stores/models/product.dart';

Product buildProduct({
  String id = 'product-1',
  String storeId = 'store-1',
  String name = 'Full House Kota',
  double price = 55,
}) {
  return Product(
    id: id,
    storeId: storeId,
    name: name,
    description: 'Quarter loaf, chips, polony, cheese, egg.',
    price: price,
    category: 'Kota',
    image: null,
    available: true,
    isVegetarian: false,
    isSpicy: true,
    preparationTime: 15,
  );
}

void main() {
  // The basket persists through SharedPreferences, so the plugin needs a
  // stand-in before any notifier is built.
  setUp(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
  });

  group('cart arithmetic', () {
    test('a line total is unit price times quantity', () {
      const line = CartLine(
        productId: 'p1',
        name: 'Kota',
        unitPrice: 55,
        quantity: 3,
      );

      expect(line.lineTotal, 165);
    });

    test('a basket sums its lines and counts its items', () {
      const cart = Cart(
        storeId: 'store-1',
        storeName: 'Mama Ntuli',
        lines: [
          CartLine(productId: 'p1', name: 'Kota', unitPrice: 55, quantity: 2),
          CartLine(productId: 'p2', name: 'Atchar', unitPrice: 12.5, quantity: 1),
        ],
      );

      expect(cart.subtotal, 122.5);
      expect(cart.itemCount, 3);
      expect(cart.quantityOf('p1'), 2);
      expect(cart.quantityOf('nope'), 0);
    });

    test('survives a round trip through storage', () {
      const cart = Cart(
        storeId: 'store-1',
        storeName: 'Mama Ntuli',
        lines: [
          CartLine(
            productId: 'p1',
            name: 'Kota',
            unitPrice: 55,
            quantity: 2,
            specialInstructions: 'No polony',
          ),
        ],
      );

      final restored = Cart.fromJson(
        jsonDecode(jsonEncode(cart.toJson())) as Map<String, dynamic>,
      );

      expect(restored.storeId, 'store-1');
      expect(restored.lines.single.specialInstructions, 'No polony');
      expect(restored.subtotal, cart.subtotal);
    });

    test('a corrupt stored basket decodes to an empty one', () {
      final cart = Cart.fromJson({'storeId': 42, 'lines': 'not a list'});

      expect(cart.isEmpty, isTrue);
      expect(cart.storeId, isNull);
    });
  });

  group('cart notifier', () {
    test('adding the same item twice increases its quantity', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final notifier = container.read(cartProvider.notifier);
      notifier.add(buildProduct(), storeName: 'Mama Ntuli');
      notifier.add(buildProduct(), storeName: 'Mama Ntuli');

      final cart = container.read(cartProvider);
      expect(cart.lines, hasLength(1));
      expect(cart.lines.single.quantity, 2);
      expect(container.read(cartCountProvider), 2);
    });

    test('adding from another kitchen replaces the basket, and says so', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final notifier = container.read(cartProvider.notifier);
      notifier.add(buildProduct(), storeName: 'Mama Ntuli');

      final result = notifier.add(
        buildProduct(id: 'product-2', storeId: 'store-2', name: 'Bunny Chow'),
        storeName: 'Durban Corner',
      );

      expect(result, AddToCartResult.replacedOtherStore);

      final cart = container.read(cartProvider);
      expect(cart.storeId, 'store-2');
      expect(cart.storeName, 'Durban Corner');
      expect(cart.lines.single.name, 'Bunny Chow');
    });

    test('setting a quantity to zero removes the line', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final notifier = container.read(cartProvider.notifier);
      notifier.add(buildProduct(), storeName: 'Mama Ntuli');
      notifier.setQuantity('product-1', 0);

      expect(container.read(cartProvider).isEmpty, isTrue);
    });

    test('emptying the basket forgets the kitchen it belonged to', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final notifier = container.read(cartProvider.notifier);
      notifier.add(buildProduct(), storeName: 'Mama Ntuli');
      notifier.remove('product-1');

      // Otherwise the next thing added would count as a store switch and warn
      // the customer about a basket that no longer exists.
      expect(container.read(cartProvider).storeId, isNull);
    });

    test('a note is kept against the line it was written for', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final notifier = container.read(cartProvider.notifier);
      notifier.add(buildProduct(), storeName: 'Mama Ntuli');
      notifier.add(buildProduct(id: 'product-2'), storeName: 'Mama Ntuli');
      notifier.setInstructions('product-2', 'Extra chilli');

      final lines = container.read(cartProvider).lines;
      expect(
        lines.firstWhere((l) => l.productId == 'product-1').specialInstructions,
        isNull,
      );
      expect(
        lines.firstWhere((l) => l.productId == 'product-2').specialInstructions,
        'Extra chilli',
      );
    });
  });

  group('order deserialisation', () {
    test('reads the server shape, delivery code included', () {
      final order = CustomerOrder.fromJson({
        'id': 'order-abc123',
        'status': 'pending',
        'paymentStatus': 'pending',
        'paymentMethod': 'cash',
        'storeName': 'Mama Ntuli',
        'subtotal': 110,
        'deliveryFee': 20,
        'total': 130,
        'deliveryCode': '482913',
        'deliveryVerified': false,
        'deliveryAddress': {
          'street': '12 Vilakazi Street',
          'city': 'Soweto',
          'postalCode': '1804',
        },
      });

      expect(order.total, 130);
      expect(order.deliveryCode, '482913');
      expect(order.isPaid, isFalse);
      expect(order.reference, 'ORDER-');
      expect(order.address.oneLine, '12 Vilakazi Street, Soweto, 1804');
    });

    test('a missing delivery code is absent, not an empty string', () {
      // The API omits it for anyone but the order's own customer, so the UI has
      // to tell "not mine to see" apart from a blank code.
      final order = CustomerOrder.fromJson({'id': 'x', 'total': 99});

      expect(order.deliveryCode, isNull);
      expect(order.total, 99);
    });

    test('an address drops an empty note rather than sending one', () {
      const address = DeliveryAddress(
        street: ' 12 Vilakazi Street ',
        city: 'Soweto',
        postalCode: '1804',
        instructions: '   ',
      );

      final json = address.toJson();
      expect(json['street'], '12 Vilakazi Street');
      expect(json.containsKey('instructions'), isFalse);
    });

    test('a payment attempt reads the sandbox marker from the envelope', () {
      final attempt = PaymentAttempt.fromJson(
        {'id': 'pay-1', 'status': 'initiated', 'providerReference': 'ref-1'},
        meta: {
          'clientPayload': {'simulated': true},
        },
      );

      expect(attempt.isSandbox, isTrue);
      expect(attempt.succeeded, isFalse);
      expect(attempt.providerReference, 'ref-1');
    });
  });

  group('checkout', () {
    test('places an order with no prices in it, then pays for it', () async {
      final requests = <String, Map<String, dynamic>?>{};
      final calls = <String>[];

      final container = _containerWith(
        MockClient((request) async {
          final key = '${request.method} ${request.url.path}';
          calls.add(key);
          requests[key] = request.body.isEmpty
              ? null
              : jsonDecode(request.body) as Map<String, dynamic>;

          return switch (key) {
            'POST /api/v1/orders' => _json(201, {
              'data': _order(paymentStatus: 'pending'),
            }),
            'POST /api/v1/payments' => _json(201, {
              'data': {
                'id': 'pay-1',
                'status': 'initiated',
                'providerReference': 'ref-1',
              },
              'meta': {
                'clientPayload': {'simulated': true},
              },
            }),
            'POST /api/v1/payments/sandbox/ref-1/complete' => _json(200, {
              'data': {'outcome': 'succeed'},
            }),
            'POST /api/v1/payments/pay-1/verify' => _json(200, {
              'data': {
                'id': 'pay-1',
                'status': 'succeeded',
                'providerReference': 'ref-1',
              },
            }),
            'GET /api/v1/orders/order-1' => _json(200, {
              'data': _order(paymentStatus: 'paid'),
            }),
            _ => _json(404, {
              'error': {'code': 'not_found', 'message': 'No such route.'},
            }),
          };
        }),
      );
      addTearDown(container.dispose);

      container
          .read(cartProvider.notifier)
          .add(buildProduct(), storeName: 'Mama Ntuli');
      container.read(cartProvider.notifier).setQuantity('product-1', 2);
      container
          .read(cartProvider.notifier)
          .setInstructions('product-1', 'No polony');

      await container.read(checkoutControllerProvider.notifier).submit(
        address: const DeliveryAddress(
          street: '12 Vilakazi Street',
          city: 'Soweto',
          postalCode: '1804',
        ),
        paymentMethod: PaymentMethod.yoco,
        customerPhone: '082 123 4567',
      );

      // The whole sequence ran, in order.
      expect(calls, [
        'POST /api/v1/orders',
        'POST /api/v1/payments',
        'POST /api/v1/payments/sandbox/ref-1/complete',
        'POST /api/v1/payments/pay-1/verify',
        'GET /api/v1/orders/order-1',
      ]);

      final placed = requests['POST /api/v1/orders']!;
      expect(placed.keys, <String>{
        'storeId',
        'items',
        'deliveryAddress',
        'paymentMethod',
        'customerPhone',
      });

      final item = (placed['items'] as List).single as Map<String, dynamic>;
      expect(item, {
        'productId': 'product-1',
        'quantity': 2,
        'specialInstructions': 'No polony',
      });
      // The API's schema is strict, so any of these would be a 400 — but the
      // point of asserting here is that the app never even forms the thought.
      expect(item.containsKey('price'), isFalse);
      expect(placed.containsKey('total'), isFalse);
      expect(placed.containsKey('paymentStatus'), isFalse);
      expect(placed.containsKey('deliveryCode'), isFalse);

      // Spaces stripped, because that is the form the API's pattern accepts.
      expect(placed['customerPhone'], '0821234567');

      final state = container.read(checkoutControllerProvider);
      expect(state, isA<CheckoutDone>());
      expect((state as CheckoutDone).order.isPaid, isTrue);
      expect(state.order.deliveryCode, '482913');

      // The basket became an order, so it is gone.
      expect(container.read(cartProvider).isEmpty, isTrue);
    });

    test('a cash order is placed and never charged', () async {
      final calls = <String>[];
      Map<String, dynamic>? placed;

      final container = _containerWith(
        MockClient((request) async {
          calls.add('${request.method} ${request.url.path}');
          placed = jsonDecode(request.body) as Map<String, dynamic>;
          return _json(201, {'data': _order(paymentMethod: 'cash')});
        }),
      );
      addTearDown(container.dispose);

      container
          .read(cartProvider.notifier)
          .add(buildProduct(), storeName: 'Mama Ntuli');

      await container.read(checkoutControllerProvider.notifier).submit(
        address: const DeliveryAddress(
          street: '12 Vilakazi Street',
          city: 'Soweto',
          postalCode: '1804',
        ),
        paymentMethod: PaymentMethod.cash,
        customerPhone: '0821234567',
        cashAmount: 200,
      );

      // No payment provider is involved: cash is settled by the server when
      // the driver confirms delivery.
      expect(calls, ['POST /api/v1/orders']);
      expect(placed!['cashAmount'], 200);
      expect(container.read(checkoutControllerProvider), isA<CheckoutDone>());
    });

    test('a cash amount is never sent on a card order', () async {
      Map<String, dynamic>? placed;

      final container = _containerWith(
        MockClient((request) async {
          if (request.url.path == '/api/v1/orders') {
            placed = jsonDecode(request.body) as Map<String, dynamic>;
            return _json(201, {'data': _order()});
          }
          // Stop after placing; this test is only about the request body.
          return _json(500, {
            'error': {'code': 'internal', 'message': 'Not under test.'},
          });
        }),
      );
      addTearDown(container.dispose);

      container
          .read(cartProvider.notifier)
          .add(buildProduct(), storeName: 'Mama Ntuli');

      await container.read(checkoutControllerProvider.notifier).submit(
        address: const DeliveryAddress(
          street: '12 Vilakazi Street',
          city: 'Soweto',
          postalCode: '1804',
        ),
        paymentMethod: PaymentMethod.yoco,
        customerPhone: '0821234567',
        cashAmount: 200,
      );

      // The API rejects `cashAmount` on a card order, and it would be
      // meaningless anyway.
      expect(placed!.containsKey('cashAmount'), isFalse);
    });

    test('a rejected order leaves the basket alone', () async {
      final container = _containerWith(
        MockClient((request) async {
          return _json(422, {
            'error': {
              'code': 'unprocessable',
              'message': 'This kitchen has a R80 minimum order.',
            },
          });
        }),
      );
      addTearDown(container.dispose);

      container
          .read(cartProvider.notifier)
          .add(buildProduct(), storeName: 'Mama Ntuli');

      await container.read(checkoutControllerProvider.notifier).submit(
        address: const DeliveryAddress(
          street: '12 Vilakazi Street',
          city: 'Soweto',
          postalCode: '1804',
        ),
        paymentMethod: PaymentMethod.cash,
        customerPhone: '0821234567',
      );

      final state = container.read(checkoutControllerProvider);
      expect(state, isA<CheckoutFailed>());
      expect(
        ((state as CheckoutFailed).error as ApiException).message,
        'This kitchen has a R80 minimum order.',
      );

      // Nothing was ordered, so the customer keeps what they chose.
      expect(container.read(cartProvider).isEmpty, isFalse);
    });

    test('a failed payment keeps the order and offers to pay again', () async {
      var verifyCalls = 0;

      final container = _containerWith(
        MockClient((request) async {
          final path = request.url.path;

          if (path == '/api/v1/orders') {
            return _json(201, {'data': _order()});
          }
          if (path == '/api/v1/payments') {
            return _json(201, {
              'data': {
                'id': 'pay-1',
                'status': 'initiated',
                'providerReference': 'ref-1',
              },
              'meta': {
                'clientPayload': {'simulated': true},
              },
            });
          }
          if (path.endsWith('/complete')) {
            return _json(200, {'data': {}});
          }
          if (path.endsWith('/verify')) {
            verifyCalls++;
            // Declined the first time, accepted on the retry.
            return _json(200, {
              'data': verifyCalls == 1
                  ? {
                      'id': 'pay-1',
                      'status': 'failed',
                      'providerReference': 'ref-1',
                      'failureReason': 'Insufficient funds.',
                    }
                  : {
                      'id': 'pay-1',
                      'status': 'succeeded',
                      'providerReference': 'ref-1',
                    },
            });
          }
          return _json(200, {'data': _order(paymentStatus: 'paid')});
        }),
      );
      addTearDown(container.dispose);

      container
          .read(cartProvider.notifier)
          .add(buildProduct(), storeName: 'Mama Ntuli');

      final controller = container.read(checkoutControllerProvider.notifier);
      await controller.submit(
        address: const DeliveryAddress(
          street: '12 Vilakazi Street',
          city: 'Soweto',
          postalCode: '1804',
        ),
        paymentMethod: PaymentMethod.yoco,
        customerPhone: '0821234567',
      );

      final failed = container.read(checkoutControllerProvider);
      expect(failed, isA<CheckoutPaymentFailed>());
      expect((failed as CheckoutPaymentFailed).message, 'Insufficient funds.');
      // The order exists. Retrying must pay for it, not place another.
      expect(failed.order.id, 'order-1');

      await controller.retryPayment();

      final done = container.read(checkoutControllerProvider);
      expect(done, isA<CheckoutDone>());
      expect((done as CheckoutDone).order.isPaid, isTrue);
    });

    test('an unconfirmed payment is not treated as a paid one', () async {
      final container = _containerWith(
        MockClient((request) async {
          final path = request.url.path;

          if (path == '/api/v1/orders') return _json(201, {'data': _order()});
          if (path == '/api/v1/payments') {
            return _json(201, {
              'data': {
                'id': 'pay-1',
                'status': 'initiated',
                'providerReference': 'ref-1',
              },
              // No sandbox marker: a live provider would have redirected the
              // customer, and nothing has confirmed the charge.
              'meta': <String, dynamic>{},
            });
          }
          if (path.endsWith('/verify')) {
            return _json(200, {
              'data': {
                'id': 'pay-1',
                'status': 'initiated',
                'providerReference': 'ref-1',
              },
            });
          }
          return _json(200, {'data': _order()});
        }),
      );
      addTearDown(container.dispose);

      container
          .read(cartProvider.notifier)
          .add(buildProduct(), storeName: 'Mama Ntuli');

      await container.read(checkoutControllerProvider.notifier).submit(
        address: const DeliveryAddress(
          street: '12 Vilakazi Street',
          city: 'Soweto',
          postalCode: '1804',
        ),
        paymentMethod: PaymentMethod.ozow,
        customerPhone: '0821234567',
      );

      // Showing a paid confirmation here would tell the customer they had paid
      // when nobody has taken their money.
      expect(
        container.read(checkoutControllerProvider),
        isA<CheckoutPaymentFailed>(),
      );
    });
  });
}

/// A container whose API client talks to [client] instead of the network.
ProviderContainer _containerWith(http.Client client) {
  return ProviderContainer(
    overrides: [
      apiClientProvider.overrideWithValue(
        ApiClient(
          httpClient: client,
          baseUrl: 'http://api.test',
          // Checkout is authenticated, and the client refuses to send an
          // anonymous request rather than letting the API answer 401.
          tokenProvider: () async => 'test-id-token',
        ),
      ),
    ],
  );
}

http.Response _json(int status, Map<String, dynamic> body) {
  return http.Response(
    jsonEncode(body),
    status,
    headers: {'content-type': 'application/json'},
  );
}

Map<String, dynamic> _order({
  String paymentStatus = 'pending',
  String paymentMethod = 'yoco',
}) {
  return {
    'id': 'order-1',
    'status': 'pending',
    'paymentStatus': paymentStatus,
    'paymentMethod': paymentMethod,
    'storeName': 'Mama Ntuli',
    'subtotal': 110,
    'deliveryFee': 20,
    'total': 130,
    'deliveryCode': '482913',
    'deliveryVerified': false,
    'deliveryAddress': {
      'street': '12 Vilakazi Street',
      'city': 'Soweto',
      'postalCode': '1804',
    },
  };
}
