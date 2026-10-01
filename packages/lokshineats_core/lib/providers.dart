/// Cross-cutting dependencies.
///
/// These two are together because they depend on each other: the API client
/// needs a token, and the token comes from Firebase Auth. Feature providers
/// build on top of them.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/auth/auth_repository.dart';
import 'package:lokshineats_core/network/api_client.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository();
});

/// The HTTP client, kept alive for the app's lifetime.
///
/// Constructed once so connections are reused; a client per request would
/// mean a new TCP and TLS handshake on every screen.
///
/// The token provider is a callback rather than a value, so it is read at the
/// moment of each request. That matters: Firebase refreshes ID tokens roughly
/// hourly, and a token captured once at startup would start failing.
final apiClientProvider = Provider<ApiClient>((ref) {
  final auth = ref.watch(authRepositoryProvider);

  final client = ApiClient(tokenProvider: () => auth.idToken());
  ref.onDispose(client.close);
  return client;
});
