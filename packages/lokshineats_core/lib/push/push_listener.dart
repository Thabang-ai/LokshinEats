/// What an app does when a push arrives or is tapped.
///
/// The mechanics are the same in all three apps - subscribe, say it while the
/// app is open, open it when tapped, and handle the push that launched the
/// app from closed - while what "open it" means differs: a customer wants the
/// order they are waiting for, a kitchen its queue, a driver the board. So
/// the mechanics live here and each app supplies the two handlers.
///
/// Mounted around the app rather than inside it: push is a startup side
/// effect, and keeping it out of `app.dart` lets widget tests mount an app
/// without a push service.
library;

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'push_messaging.dart';
import 'push_registration.dart';

/// The app's navigator and messenger, reachable from outside the widget tree
/// that owns them - which is where a push arrives from.
final appNavigatorKey = GlobalKey<NavigatorState>();
final appMessengerKey = GlobalKey<ScaffoldMessengerState>();

typedef PushHandler = void Function(PushMessage message);

/// Called when a push arrives while the app is open, before it is shown.
///
/// For refreshing whatever is on screen, so someone watching a list sees the
/// change now rather than at the next poll.
final pushArrivedProvider = Provider<PushHandler>((ref) => (_) {});

/// Called when a push is tapped, or when one launched the app.
///
/// This is the app's "take me to it": the screen the notification was about.
final pushOpenedProvider = Provider<PushHandler>((ref) => (_) {});

/// Whether a push arriving while the app is open should also be shown as a
/// message at the bottom of the screen. A kitchen watching its queue update
/// itself does not need a banner over it as well.
final pushShowsInAppProvider = Provider<bool>((ref) => true);

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

    // The push that launched the app from closed, if any. A failure here is
    // not worth a crash on startup: the inbox still has it.
    unawaited(
      messaging
          .initialMessage()
          .then((message) {
            if (message != null) _open(message);
          })
          .catchError((Object _) {}),
    );

    // On the web a clicked push opens the app at /?order=<id>, because the
    // browser has no "initial message" to hand over. The id only opens a
    // screen that asks the API for the order, so a made-up id shows "not
    // found" rather than somebody else's order.
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
    ref.read(pushArrivedProvider)(message);

    if (!ref.read(pushShowsInAppProvider)) return;

    appMessengerKey.currentState
      ?..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(
            message.body.isEmpty
                ? message.title
                : '${message.title}. ${message.body}',
          ),
          action: message.orderId == null
              ? null
              : SnackBarAction(label: 'View', onPressed: () => _open(message)),
        ),
      );
  }

  void _open(PushMessage message) => ref.read(pushOpenedProvider)(message);

  @override
  Widget build(BuildContext context) => widget.child;
}
