/// What the app does when a push arrives or is tapped.
///
/// Arriving while the app is open: say it at the bottom of the screen with a
/// way to open the order, and bring the bell up to date. Tapped from outside
/// the app: open the order it is about, which for "on the way" is the screen
/// with the delivery code - the reason they tapped it.
///
/// Mounted from `main.dart`, around the app, rather than inside it: push is a
/// startup side effect, and `app.dart` is kept free of those so widget tests
/// can mount the app without a push service.
library;

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../orders/pages/order_tracking_page.dart';
import '../../orders/providers/order_tracking_providers.dart';
import '../providers/notification_providers.dart';
import 'push_messaging.dart';
import 'push_registration.dart';

/// The app's navigator and messenger, reachable from outside the widget tree
/// that owns them - which is where a push arrives from.
final appNavigatorKey = GlobalKey<NavigatorState>();
final appMessengerKey = GlobalKey<ScaffoldMessengerState>();

class PushListener extends ConsumerStatefulWidget {
  const PushListener({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<PushListener> createState() => _PushListenerState();
}

class _PushListenerState extends ConsumerState<PushListener> {
  final _subscriptions = <StreamSubscription<PushMessage>>[];

  @override
  void initState() {
    super.initState();

    final messaging = ref.read(pushMessagingProvider);
    if (!messaging.isSupported) return;

    ref.read(pushRegistrarProvider).start();

    _subscriptions
      ..add(messaging.onForegroundMessage.listen(_arrived))
      ..add(messaging.onOpened.listen(_open));

    unawaited(
      messaging
          .initialMessage()
          .then((message) {
            if (message != null) _open(message);
          })
          .catchError((Object _) {}),
    );

    // On the web a clicked push opens the app at /?order=<id> (see
    // web/firebase-messaging-sw.js), because the browser has no "initial
    // message" to hand over. The id only opens the tracking screen, which
    // asks the API for the order - so a made-up id shows "not found", never
    // someone else's order.
    if (kIsWeb) {
      final orderId = Uri.base.queryParameters['order'];
      if (orderId != null && orderId.isNotEmpty) {
        WidgetsBinding.instance.addPostFrameCallback(
          (_) => _open(PushMessage(title: '', body: '', orderId: orderId)),
        );
      }
    }
  }

  @override
  void dispose() {
    for (final subscription in _subscriptions) {
      subscription.cancel();
    }
    super.dispose();
  }

  void _arrived(PushMessage message) {
    unawaited(ref.read(inboxProvider.notifier).refresh());

    final orderId = message.orderId;
    if (orderId != null && ref.exists(orderTrackingProvider(orderId))) {
      // Someone watching this order sees the change now, not at the next poll.
      unawaited(ref.read(orderTrackingProvider(orderId).notifier).refresh());
    }

    appMessengerKey.currentState
      ?..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(
            message.body.isEmpty
                ? message.title
                : '${message.title}. ${message.body}',
          ),
          action: orderId == null
              ? null
              : SnackBarAction(label: 'View', onPressed: () => _open(message)),
        ),
      );
  }

  void _open(PushMessage message) {
    unawaited(ref.read(inboxProvider.notifier).refresh());

    final orderId = message.orderId;
    if (orderId == null) return;

    appNavigatorKey.currentState?.push(
      MaterialPageRoute<void>(
        builder: (_) => OrderTrackingPage(orderId: orderId),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
