/// Authentication state and the actions that change it.
///
/// There are two independent facts here — is there a Firebase session, and
/// does the API have a profile for it — and the app has to handle the gap
/// between them. Someone can be signed in with no profile if sign-up was
/// interrupted after Firebase created the account but before the API call
/// finished, and that is recoverable rather than broken.
library;

import 'package:firebase_auth/firebase_auth.dart' show User;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../models/user_profile.dart';
import '../repositories/profile_repository.dart';

final profileRepositoryProvider = Provider<ProfileRepository>((ref) {
  return ProfileRepository(ref.watch(apiClientProvider));
});

/// The Firebase session, or null. Emits on sign-in and sign-out.
final firebaseUserProvider = StreamProvider<User?>((ref) {
  return ref.watch(authRepositoryProvider).authStateChanges();
});

/// True when someone is signed in, whether or not they have a profile.
final isSignedInProvider = Provider<bool>((ref) {
  return ref.watch(firebaseUserProvider).value != null;
});

/// The signed-in customer's API profile.
///
/// Null means one of two things, and the caller cannot tell them apart from
/// this alone: nobody is signed in, or they are but have no profile yet.
/// [needsProfileProvider] distinguishes them.
final profileProvider = FutureProvider<UserProfile?>((ref) async {
  final user = ref.watch(firebaseUserProvider).value;
  if (user == null) return null;

  return ref.watch(profileRepositoryProvider).fetchMe();
});

/// Signed in to Firebase, but the API has no profile yet.
final needsProfileProvider = Provider<bool>((ref) {
  final signedIn = ref.watch(isSignedInProvider);
  final profile = ref.watch(profileProvider);

  return signedIn && profile.hasValue && profile.value == null;
});

/// Sign-in, sign-up and sign-out.
///
/// An [AsyncNotifier] rather than a plain method call so every screen gets the
/// in-flight and failed states for free, instead of each one inventing its own
/// `isLoading` boolean.
class AuthController extends AsyncNotifier<void> {
  @override
  Future<void> build() async {}

  Future<bool> signIn({
    required String email,
    required String password,
  }) async {
    state = const AsyncLoading();

    final result = await AsyncValue.guard(() async {
      await ref.read(authRepositoryProvider).signIn(
        email: email,
        password: password,
      );
      // The profile belongs to the account that just signed in, not the
      // previous one.
      ref.invalidate(profileProvider);
    });

    state = result;
    return !result.hasError;
  }

  /// Create the Firebase account and the API profile together.
  ///
  /// If the profile call fails the Firebase account still exists, so the app
  /// lands in [needsProfileProvider] and can finish the job rather than
  /// stranding the customer with an account they cannot use.
  Future<bool> signUp({
    required String email,
    required String password,
    required String displayName,
    String? phone,
  }) async {
    state = const AsyncLoading();

    final result = await AsyncValue.guard(() async {
      await ref.read(authRepositoryProvider).signUp(
        email: email,
        password: password,
        displayName: displayName,
      );

      await ref.read(profileRepositoryProvider).createMe(
        displayName: displayName,
        phone: phone,
      );

      ref.invalidate(profileProvider);
    });

    state = result;
    return !result.hasError;
  }

  /// Finish a sign-up whose profile call did not complete.
  Future<bool> completeProfile({
    required String displayName,
    String? phone,
  }) async {
    state = const AsyncLoading();

    final result = await AsyncValue.guard(() async {
      await ref.read(profileRepositoryProvider).createMe(
        displayName: displayName,
        phone: phone,
      );
      ref.invalidate(profileProvider);
    });

    state = result;
    return !result.hasError;
  }

  Future<bool> sendPasswordReset(String email) async {
    state = const AsyncLoading();

    final result = await AsyncValue.guard(
      () => ref.read(authRepositoryProvider).sendPasswordReset(email),
    );

    state = result;
    return !result.hasError;
  }

  Future<void> signOut() async {
    await ref.read(authRepositoryProvider).signOut();
    ref.invalidate(profileProvider);
    state = const AsyncData(null);
  }
}

final authControllerProvider = AsyncNotifierProvider<AuthController, void>(
  AuthController.new,
);

/// Saving changes to the profile.
///
/// Separate from [AuthController] so a failed save cannot leave an error
/// showing on the sign-in screen, and auto-disposed so a stale error does not
/// greet the customer the next time they open the edit screen.
class ProfileController extends AsyncNotifier<void> {
  @override
  Future<void> build() async {}

  Future<bool> save({
    required String displayName,
    required String phone,
    required ProfileAddress? address,
  }) async {
    state = const AsyncLoading();

    final result = await AsyncValue.guard(() async {
      await ref.read(profileRepositoryProvider).updateMe(
        displayName: displayName,
        phone: phone,
        address: address,
      );
      // The account page and checkout's prefill both read from here.
      ref.invalidate(profileProvider);
    });

    if (!ref.mounted) return !result.hasError;
    state = result;
    return !result.hasError;
  }
}

final profileControllerProvider =
    AsyncNotifierProvider.autoDispose<ProfileController, void>(
      ProfileController.new,
    );
