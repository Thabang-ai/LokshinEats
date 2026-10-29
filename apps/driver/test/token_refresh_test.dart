/// Catching up with an approval.
///
/// Most drivers sign up as customers first - they ordered food before they
/// delivered it - and the role that lets them take a delivery is granted when
/// an admin approves their application, long after the token in their phone
/// was minted. Until the phone mints a new one, every delivery route answers
/// "This endpoint requires the driver or admin role", which is exactly what
/// an approved driver reported.
///
/// The API says when the token is out of date. This is the app acting on it,
/// before the board asks for a single thing.
library;

import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/network/api_client.dart';
import 'package:lokshineats_core/providers.dart';

import 'package:lokshineats_driver/features/verification/models/driver_verification.dart';
import 'package:lokshineats_driver/features/verification/providers/verification_providers.dart';

Map<String, Object?> approved() => {
  'vehicleType': 'motorbike',
  'licenceNumber': 'DL-4482913',
  'vehicleRegistration': 'CA 512 345',
  'idNumber': '9203145800084',
  'status': 'approved',
  'decisionReason': null,
};

/// The API, answering `/drivers/me` with or without the stale-token warning.
ApiClient _api({required bool tokenRefreshRequired, List<String>? calls}) =>
    ApiClient(
      httpClient: MockClient((request) async {
        calls?.add(request.url.path);
        return http.Response(
          jsonEncode({
            'data': approved(),
            if (tokenRefreshRequired)
              'meta': {'tokenRefreshRequired': true},
          }),
          200,
          headers: const {'content-type': 'application/json'},
        );
      }),
      baseUrl: 'http://api.test',
      tokenProvider: () async => 'test-id-token',
    );

ProviderContainer _container({
  required bool tokenRefreshRequired,
  required List<String> refreshes,
  List<String>? calls,
}) {
  final container = ProviderContainer(
    overrides: [
      apiClientProvider.overrideWithValue(
        _api(tokenRefreshRequired: tokenRefreshRequired, calls: calls),
      ),
      isSignedInProvider.overrideWithValue(true),
      tokenRefresherProvider.overrideWithValue(() async {
        refreshes.add('refreshed');
      }),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

void main() {
  test('mints a new token when the API says this one is out of date', () async {
    final refreshes = <String>[];
    final container = _container(
      tokenRefreshRequired: true,
      refreshes: refreshes,
    );

    final verification = await container.read(verificationProvider.future);

    expect(verification?.status, VerificationStatus.approved);
    expect(refreshes, ['refreshed']);
  });

  test('leaves a token that is already right alone', () async {
    final refreshes = <String>[];
    final container = _container(
      tokenRefreshRequired: false,
      refreshes: refreshes,
    );

    await container.read(verificationProvider.future);

    expect(refreshes, isEmpty);
  });

  test('the refresh finishes before the driver is let through', () async {
    // The board is built the moment this resolves, so a refresh still in
    // flight is a board asking with the old token.
    final refreshes = <String>[];
    final container = _container(
      tokenRefreshRequired: true,
      refreshes: refreshes,
    );

    final pending = container.read(verificationProvider.future);
    expect(refreshes, isEmpty, reason: 'not before the API has answered');

    await pending;
    expect(refreshes, ['refreshed']);
  });

  test('a refusal to mint one does not lock the driver out', () async {
    final container = ProviderContainer(
      overrides: [
        apiClientProvider.overrideWithValue(
          _api(tokenRefreshRequired: true),
        ),
        isSignedInProvider.overrideWithValue(true),
        tokenRefresherProvider.overrideWithValue(
          () async => throw Exception('no network'),
        ),
      ],
    );
    addTearDown(container.dispose);

    final verification = await container.read(verificationProvider.future);

    expect(verification?.mayDeliver, isTrue);
  });

  test('refreshing the screen asks again, and acts on the answer', () async {
    final refreshes = <String>[];
    final calls = <String>[];
    final container = _container(
      tokenRefreshRequired: true,
      refreshes: refreshes,
      calls: calls,
    );

    await container.read(verificationProvider.future);
    await container.read(verificationProvider.notifier).refresh();

    expect(calls, hasLength(2));
    expect(refreshes, hasLength(2));
  });
}
