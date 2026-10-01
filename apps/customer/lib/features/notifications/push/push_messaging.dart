/// The phone's push service, behind a small interface.
///
/// The app only needs a handful of things from Firebase Cloud Messaging:
/// permission, a token, and word of messages arriving or being tapped. Keeping
/// it to those, behind an interface, lets the rest of the app be tested with a
/// stand-in instead of a real push service.
///
/// Where push is supported:
///  * Android and iOS: yes. (iOS also needs APNs configured for the Firebase
///    project; until it is, asking for a token fails and is logged, and the
///    inbox still works.)
///  * Web: only when built with a VAPID key - see `AppConfig.fcmVapidKey`.
///    Without one the app does not ask for permission at all.
///  * Anything else: no.
library;

import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/config/app_config.dart';

/// A push that arrived, or was tapped - enough to say it and to open it.
class PushMessage {
  const PushMessage({required this.title, required this.body, this.orderId});

  final String title;
  final String body;

  /// The order it is about, which opening it shows.
  final String? orderId;
}

abstract class PushMessaging {
  /// This platform can receive push, as this build is configured.
  bool get isSupported;

  /// `android`, `ios` or `web`, as the API expects it.
  String get platform;

  /// Ask the person, if the platform needs asking. True if they agreed.
  Future<bool> requestPermission();

  /// This device's token, or null if the push service would not issue one.
  Future<String?> getToken();

  /// The push service replaced the token; the API must be told the new one.
  Stream<String> get onTokenRefresh;

  /// A push arrived while the app was open.
  Stream<PushMessage> get onForegroundMessage;

  /// A push was tapped while the app was in the background.
  Stream<PushMessage> get onOpened;

  /// The push that launched the app from closed, if any.
  Future<PushMessage?> initialMessage();
}

class FirebasePushMessaging implements PushMessaging {
  const FirebasePushMessaging();

  FirebaseMessaging get _messaging => FirebaseMessaging.instance;

  @override
  bool get isSupported {
    if (kIsWeb) return AppConfig.fcmVapidKey.isNotEmpty;
    return defaultTargetPlatform == TargetPlatform.android ||
        defaultTargetPlatform == TargetPlatform.iOS;
  }

  @override
  String get platform {
    if (kIsWeb) return 'web';
    return defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';
  }

  @override
  Future<bool> requestPermission() async {
    final settings = await _messaging.requestPermission();
    return settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional;
  }

  @override
  Future<String?> getToken() =>
      _messaging.getToken(vapidKey: kIsWeb ? AppConfig.fcmVapidKey : null);

  @override
  Stream<String> get onTokenRefresh => _messaging.onTokenRefresh;

  @override
  Stream<PushMessage> get onForegroundMessage =>
      FirebaseMessaging.onMessage.map(_toMessage);

  @override
  Stream<PushMessage> get onOpened =>
      FirebaseMessaging.onMessageOpenedApp.map(_toMessage);

  @override
  Future<PushMessage?> initialMessage() async {
    final message = await _messaging.getInitialMessage();
    return message == null ? null : _toMessage(message);
  }

  static PushMessage _toMessage(RemoteMessage message) => PushMessage(
    title: message.notification?.title ?? '',
    body: message.notification?.body ?? '',
    orderId: switch (message.data['orderId']) {
      final String id when id.isNotEmpty => id,
      _ => null,
    },
  );
}

final pushMessagingProvider = Provider<PushMessaging>(
  (ref) => const FirebasePushMessaging(),
);
