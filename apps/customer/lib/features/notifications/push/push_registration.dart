/// Keeping the API told which device to push to, for whoever is signed in.
///
/// On sign-in: ask permission, get the token, register it. When the push
/// service rotates the token: register the new one. Before sign-out: remove
/// it, while there is still a session to make that request with - otherwise
/// a shared phone would go on receiving the previous person's order updates.
///
/// Every step is best-effort. A customer who refuses permission, a platform
/// that will not issue a token, an API that is briefly unreachable: none of
/// these stop anyone using the app, and the inbox tells them everything a
/// push would have.
library;

import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart' show User;
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';

import '../providers/notification_providers.dart';
import 'push_messaging.dart';

class PushRegistrar {
  PushRegistrar(this._ref);

  final Ref _ref;

  String? _registeredToken;
  String? _registeredFor;
  StreamSubscription<String>? _refreshes;
  ProviderSubscription<AsyncValue<User?>>? _signIns;

  PushMessaging get _messaging => _ref.read(pushMessagingProvider);

  /// Start following sign-ins. Safe to call more than once.
  void start() {
    if (_signIns != null || !_messaging.isSupported) return;

    _signIns = _ref.listen(firebaseUserProvider, (previous, next) {
      final uid = next.value?.uid;
      if (uid != null && uid != _registeredFor) unawaited(_register(uid));
    }, fireImmediately: true);
  }

  Future<void> _register(String uid) async {
    try {
      if (!await _messaging.requestPermission()) return;

      final token = await _messaging.getToken();
      if (token == null) return;

      await _send(token);
      _registeredFor = uid;

      _refreshes ??= _messaging.onTokenRefresh.listen((fresh) {
        if (_registeredFor != null) unawaited(_send(fresh));
      });
    } catch (error) {
      debugPrint('Push registration skipped: $error');
    }
  }

  Future<void> _send(String token) async {
    try {
      await _ref
          .read(notificationRepositoryProvider)
          .registerDevice(token: token, platform: _messaging.platform);
      _registeredToken = token;
    } catch (error) {
      debugPrint('Could not register this device for push: $error');
    }
  }

  /// Stop pushing to this device for the account signing out.
  Future<void> unregister() async {
    final token = _registeredToken;
    _registeredToken = null;
    _registeredFor = null;
    if (token == null) return;

    try {
      await _ref.read(notificationRepositoryProvider).removeDevice(token);
    } catch (error) {
      debugPrint('Could not remove this device from push: $error');
    }
  }

  void dispose() {
    _signIns?.close();
    _refreshes?.cancel();
  }
}

final pushRegistrarProvider = Provider<PushRegistrar>((ref) {
  final registrar = PushRegistrar(ref);
  ref.onDispose(registrar.dispose);
  return registrar;
});
