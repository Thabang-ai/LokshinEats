/// Starting an app, including when it cannot start.
///
/// Every app's `main` does the same three things: check the build was pointed
/// at a real API, bring Firebase up, then run. Any of them can fail, and
/// failing in `main` before `runApp` leaves the engine with no widget tree at
/// all — which on a phone is a black screen with no explanation. It happened
/// on 2026-10-26 to a driver build released without `API_BASE_URL`: the guard
/// was right, the app refused to start, and nobody could tell why without a
/// cable and `adb logcat`.
///
/// So a refusal to start is itself a screen now. The check is unchanged: a
/// release build pointed at `localhost` still does not run, because quietly
/// calling a machine that is not there would look like an outage to every
/// driver. It just says so.
library;

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'package:lokshineats_core/config/app_config.dart';
import 'package:lokshineats_core/firebase/firebase_bootstrap.dart';
import 'package:lokshineats_core/theme/app_theme.dart';

/// Bring an app up, or show why it could not come up.
///
/// [app] is built only once the checks pass, so nothing in it has to cope
/// with a half-started world.
Future<void> startLokshinEats({
  required FirebaseOptions options,
  required Widget Function() app,
}) async {
  WidgetsFlutterBinding.ensureInitialized();

  final problem = AppConfig.configurationProblem;
  if (problem != null) {
    debugPrint('LokshinEats will not start: $problem');
    runApp(
      StartupFailurePage(
        title: 'This app was not set up correctly',
        explanation:
            'It cannot reach LokshinEats, and reinstalling will not help. '
            'Whoever built this copy needs to build it again.',
        detail: problem,
      ),
    );
    return;
  }

  try {
    // Firebase supplies the ID token every authenticated API call carries, so
    // it has to be up before the first request rather than lazily on sign-in.
    await FirebaseBootstrap.initialise(options: options);
  } catch (error, stackTrace) {
    // Reported as well as shown: the screen is for whoever is holding the
    // phone, the log is for whoever has to fix it.
    FlutterError.reportError(
      FlutterErrorDetails(
        exception: error,
        stack: stackTrace,
        library: 'lokshineats_core',
        context: ErrorDescription('starting Firebase'),
      ),
    );

    runApp(
      StartupFailurePage(
        title: 'LokshinEats could not start',
        explanation:
            'Something went wrong before the app could open. Close it and '
            'open it again. If it keeps happening, send this to LokshinEats.',
        detail: '$error',
      ),
    );
    return;
  }

  runApp(app());
}

/// The screen that replaces a black one.
///
/// Deliberately plain: no Riverpod, no API, no Firebase, because the reason
/// it is on screen is that one of those did not come up.
class StartupFailurePage extends StatelessWidget {
  const StartupFailurePage({
    super.key,
    required this.title,
    required this.explanation,
    required this.detail,
  });

  /// What happened, in a sentence a person can read.
  final String title;

  /// What they can do about it, honestly — sometimes nothing.
  final String explanation;

  /// The technical reason, for whoever can act on it.
  final String detail;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'LokshinEats',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      home: Scaffold(
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(28),
              child: Builder(
                builder: (context) {
                  final theme = Theme.of(context);

                  return Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        Icons.error_outline_rounded,
                        size: 48,
                        color: theme.colorScheme.error,
                      ),
                      const SizedBox(height: 20),
                      Text(
                        title,
                        style: theme.textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        explanation,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(height: 24),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.surfaceContainerHighest,
                          borderRadius: BorderRadius.circular(AppTheme.radius),
                        ),
                        child: SelectableText(
                          detail,
                          style: theme.textTheme.bodySmall?.copyWith(
                            fontFamily: 'monospace',
                          ),
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),
          ),
        ),
      ),
    );
  }
}
