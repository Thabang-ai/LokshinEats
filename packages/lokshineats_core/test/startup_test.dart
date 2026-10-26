/// What a driver sees when the app cannot start.
///
/// On 2026-10-26 a driver build went out without `API_BASE_URL`. The startup
/// guard was right to refuse it, but it refused by throwing out of `main`,
/// which leaves the engine with no widget tree: a black screen, no message,
/// and no way to tell a misconfigured build from a dead phone without a cable.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lokshineats_core/config/app_config.dart';
import 'package:lokshineats_core/config/startup.dart';

void main() {
  group('the screen that replaces a black one', () {
    testWidgets('says what went wrong and who can fix it', (tester) async {
      await tester.pumpWidget(
        const StartupFailurePage(
          title: 'This app was not set up correctly',
          explanation: 'Whoever built this copy needs to build it again.',
          detail: 'API_BASE_URL is still http://localhost:4000',
        ),
      );
      await tester.pump();

      expect(find.text('This app was not set up correctly'), findsOneWidget);
      expect(
        find.text('Whoever built this copy needs to build it again.'),
        findsOneWidget,
      );
      // The technical line is shown too: it is the only thing that tells
      // whoever rebuilds it what to change.
      expect(
        find.text('API_BASE_URL is still http://localhost:4000'),
        findsOneWidget,
      );
    });

    testWidgets('stands alone, with no app behind it', (tester) async {
      // No Riverpod scope, no API client, no Firebase: the reason it is on
      // screen is that one of those did not come up.
      await tester.pumpWidget(
        const StartupFailurePage(
          title: 'LokshinEats could not start',
          explanation: 'Close it and open it again.',
          detail: 'PlatformException(channel-error)',
        ),
      );
      await tester.pump();

      expect(find.byType(MaterialApp), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a long reason scrolls rather than overflowing', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(640, 1136);
      tester.view.devicePixelRatio = 2;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(
        StartupFailurePage(
          title: 'LokshinEats could not start',
          explanation: 'Close it and open it again.',
          detail: 'A reason as long as a stack trace. ' * 20,
        ),
      );
      await tester.pump();

      expect(tester.takeException(), isNull);
    });
  });

  group('which builds refuse to start', () {
    test('a release build still pointed at this machine', () {
      // The check itself is unchanged - the fix was how it reports, not what
      // it allows. A build like this must not reach a driver.
      expect(
        AppConfig.releaseProblem(
          isRelease: true,
          apiBaseUrl: 'http://localhost:4000',
          useFirebaseEmulators: false,
        ),
        contains('API_BASE_URL'),
      );
    });

    test('a release build wired to the emulators', () {
      expect(
        AppConfig.releaseProblem(
          isRelease: true,
          apiBaseUrl: 'https://lokshineats-api.vercel.app',
          useFirebaseEmulators: true,
        ),
        contains('emulators'),
      );
    });

    test('a proper release build', () {
      expect(
        AppConfig.releaseProblem(
          isRelease: true,
          apiBaseUrl: 'https://lokshineats-api.vercel.app',
          useFirebaseEmulators: false,
        ),
        isNull,
      );
    });

    test('debug, where localhost is the whole point', () {
      expect(
        AppConfig.releaseProblem(
          isRelease: false,
          apiBaseUrl: 'http://localhost:4000',
          useFirebaseEmulators: true,
        ),
        isNull,
      );
    });

    test('this test run, which is a debug build, may start', () {
      expect(AppConfig.configurationProblem, isNull);
    });
  });
}
