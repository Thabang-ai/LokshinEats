/// A failed call to the LokshinEats API.
///
/// The API returns a stable machine-readable `code` alongside a message it
/// writes for customers, so UI can branch on the code and show the message
/// without inventing its own wording. See the error contract in
/// `server/README.md`.
library;

enum ApiErrorCode {
  badRequest,
  validationFailed,
  unauthenticated,
  forbidden,
  notFound,
  conflict,
  unprocessable,
  rateLimited,
  internal,

  /// The request never reached the server: no connection, DNS, or the API is
  /// not running. Worth distinguishing, because the fix is different.
  network,
}

ApiErrorCode _codeFrom(String? raw) => switch (raw) {
  'bad_request' => ApiErrorCode.badRequest,
  'validation_failed' => ApiErrorCode.validationFailed,
  'unauthenticated' => ApiErrorCode.unauthenticated,
  'forbidden' => ApiErrorCode.forbidden,
  'not_found' => ApiErrorCode.notFound,
  'conflict' => ApiErrorCode.conflict,
  'unprocessable' => ApiErrorCode.unprocessable,
  'rate_limited' => ApiErrorCode.rateLimited,
  _ => ApiErrorCode.internal,
};

class ApiException implements Exception {
  ApiException({
    required this.code,
    required this.status,
    required this.message,
    this.details,
    this.requestId,
  });

  /// Build from the API's error envelope.
  factory ApiException.fromResponse(int status, Map<String, dynamic>? body) {
    final error = body?['error'] as Map<String, dynamic>?;

    return ApiException(
      code: _codeFrom(error?['code'] as String?),
      status: status,
      message:
          error?['message'] as String? ??
          'Something went wrong. Please try again.',
      details: (error?['details'] as Map<String, dynamic>?)?.map(
        (key, value) => MapEntry(key, value.toString()),
      ),
      requestId: error?['requestId'] as String?,
    );
  }

  /// The request never got a response.
  factory ApiException.network(Object cause) => ApiException(
    code: ApiErrorCode.network,
    status: 0,
    message:
        'Could not reach LokshinEats. Check your connection and try again.',
    details: {'cause': cause.toString()},
  );

  final ApiErrorCode code;

  /// HTTP status, or 0 when the request never completed.
  final int status;

  /// Safe to show a customer — the API writes these for that purpose.
  final String message;

  /// Per-field messages on a validation failure, keyed by field name.
  final Map<String, String>? details;

  final String? requestId;

  /// The first field error, for forms that surface one message at a time.
  String? get firstFieldError {
    final entries = details?.entries;
    if (entries == null || entries.isEmpty) return null;
    return entries.first.value;
  }

  /// Whether retrying the same request could plausibly succeed.
  bool get isRetryable =>
      code == ApiErrorCode.network ||
      code == ApiErrorCode.internal ||
      code == ApiErrorCode.rateLimited;

  @override
  String toString() => 'ApiException($status ${code.name}): $message';
}
