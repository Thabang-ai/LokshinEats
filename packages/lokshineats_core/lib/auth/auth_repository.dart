/// Credentials, via Firebase Auth.
///
/// Only this file knows Firebase exists. Everything above it works in terms
/// of "signed in or not" and [AuthFailure], so swapping the provider later
/// would not reach the UI.
///
/// Firebase's error codes are translated here rather than shown raw: a
/// customer should read "that password is wrong", not `wrong-password`.
library;

import 'package:firebase_auth/firebase_auth.dart';

/// A sign-in problem worth showing a customer.
class AuthFailure implements Exception {
  const AuthFailure(this.message, {this.code});

  final String message;
  final String? code;

  @override
  String toString() => 'AuthFailure($code): $message';
}

class AuthRepository {
  AuthRepository({FirebaseAuth? auth}) : _auth = auth ?? FirebaseAuth.instance;

  final FirebaseAuth _auth;

  /// Emits on sign-in, sign-out, and token refresh.
  Stream<User?> authStateChanges() => _auth.authStateChanges();

  User? get currentUser => _auth.currentUser;

  /// The current ID token, refreshed automatically when close to expiry.
  ///
  /// This is what [ApiClient] sends as a bearer token; the API verifies it
  /// with the Admin SDK, so there is no second session to keep in step.
  Future<String?> idToken({bool forceRefresh = false}) async {
    final user = _auth.currentUser;
    if (user == null) return null;
    return user.getIdToken(forceRefresh);
  }

  Future<void> signIn({required String email, required String password}) async {
    try {
      await _auth.signInWithEmailAndPassword(
        email: email.trim(),
        password: password,
      );
    } on FirebaseAuthException catch (error) {
      throw _translate(error);
    }
  }

  Future<void> signUp({
    required String email,
    required String password,
    required String displayName,
  }) async {
    try {
      final credential = await _auth.createUserWithEmailAndPassword(
        email: email.trim(),
        password: password,
      );

      // Set on the Firebase account as well as the API profile, so the name
      // is there even before the profile call completes.
      await credential.user?.updateDisplayName(displayName.trim());
    } on FirebaseAuthException catch (error) {
      throw _translate(error);
    }
  }

  Future<void> sendPasswordReset(String email) async {
    try {
      await _auth.sendPasswordResetEmail(email: email.trim());
    } on FirebaseAuthException catch (error) {
      throw _translate(error);
    }
  }

  Future<void> signOut() => _auth.signOut();

  /// Firebase codes to something a customer can act on.
  ///
  /// `invalid-credential` covers a wrong password and an unknown email alike —
  /// Firebase stopped distinguishing them deliberately, so that an attacker
  /// cannot use the error to discover which addresses have accounts. The
  /// message keeps that ambiguity rather than guessing.
  AuthFailure _translate(FirebaseAuthException error) {
    final message = switch (error.code) {
      'invalid-credential' ||
      'wrong-password' ||
      'user-not-found' => 'That email or password is not right.',
      'invalid-email' => 'That does not look like an email address.',
      'email-already-in-use' =>
        'There is already an account with that email. Try signing in.',
      'weak-password' => 'Pick a longer password — at least 6 characters.',
      'user-disabled' => 'This account has been disabled. Contact support.',
      'too-many-requests' => 'Too many attempts. Wait a minute and try again.',
      'network-request-failed' =>
        'Could not reach LokshinEats. Check your connection.',
      'operation-not-allowed' =>
        'Email sign-in is not enabled for this app yet.',
      _ => 'Could not sign you in. Please try again.',
    };

    return AuthFailure(message, code: error.code);
  }
}
