/// HTTP client for the LokshinEats API.
///
/// Thin on purpose: it carries requests, unwraps the `{ data }` envelope, and
/// turns failures into [ApiException]. Every decision about money, status and
/// access lives on the server, so there is nothing for this layer to be clever
/// about.
///
/// Authentication is deliberately pluggable rather than baked in. Store and
/// menu browsing is public, so the app works signed-out today; when Firebase
/// Auth is wired up, [tokenProvider] starts returning an ID token and every
/// authenticated call picks it up without this file changing.
library;

import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'package:lokshineats_core/config/app_config.dart';
import 'package:lokshineats_core/network/api_exception.dart';

/// Supplies the current Firebase ID token, or null when signed out.
typedef TokenProvider = Future<String?> Function();

/// A successful response: the unwrapped `data`, plus the envelope's extras.
class ApiResponse<T> {
  const ApiResponse({required this.data, this.nextCursor, this.meta});

  final T data;

  /// Pass back as `cursor` to fetch the next page; null when exhausted.
  final String? nextCursor;

  final Map<String, dynamic>? meta;
}

class ApiClient {
  ApiClient({
    http.Client? httpClient,
    String? baseUrl,
    this.tokenProvider,
    this.timeout = const Duration(seconds: 20),
  }) : _http = httpClient ?? http.Client(),
       _baseUrl = (baseUrl ?? AppConfig.apiBaseUrl).replaceAll(
         RegExp(r'/+$'),
         '',
       );

  final http.Client _http;
  final String _baseUrl;

  /// Supplies the ID token for authenticated calls; null when signed out.
  final TokenProvider? tokenProvider;

  /// A request that hangs forever looks identical to a frozen app, so every
  /// call is bounded and surfaces as a network error instead.
  final Duration timeout;

  Future<ApiResponse<T>> get<T>(
    String path, {
    Map<String, String>? query,
    bool authenticated = false,
    required T Function(Object? json) decode,
  }) => _send(
    method: 'GET',
    path: path,
    query: query,
    authenticated: authenticated,
    decode: decode,
  );

  Future<ApiResponse<T>> post<T>(
    String path, {
    Object? body,
    bool authenticated = true,
    required T Function(Object? json) decode,
  }) => _send(
    method: 'POST',
    path: path,
    body: body,
    authenticated: authenticated,
    decode: decode,
  );

  Future<ApiResponse<T>> patch<T>(
    String path, {
    Object? body,
    bool authenticated = true,
    required T Function(Object? json) decode,
  }) => _send(
    method: 'PATCH',
    path: path,
    body: body,
    authenticated: authenticated,
    decode: decode,
  );

  /// Remove something. The API answers a successful delete with 204 and no
  /// body, which [_send] turns into `decode(null)`.
  Future<void> delete(String path, {bool authenticated = true}) async {
    await _send<void>(
      method: 'DELETE',
      path: path,
      authenticated: authenticated,
      decode: (_) {},
    );
  }

  Future<ApiResponse<T>> _send<T>({
    required String method,
    required String path,
    required T Function(Object? json) decode,
    Map<String, String>? query,
    Object? body,
    bool authenticated = false,
  }) async {
    final uri = Uri.parse(
      '$_baseUrl$path',
    ).replace(queryParameters: query == null || query.isEmpty ? null : query);

    final headers = <String, String>{'Accept': 'application/json'};
    if (body != null) headers['Content-Type'] = 'application/json';

    if (authenticated) {
      final token = await tokenProvider?.call();
      if (token == null) {
        // Fail here rather than sending an anonymous request, so the customer
        // sees "please log in" instead of an opaque 401.
        throw ApiException(
          code: ApiErrorCode.unauthenticated,
          status: 401,
          message: 'Please log in to continue.',
        );
      }
      headers['Authorization'] = 'Bearer $token';
    }

    http.Response response;
    try {
      final request = http.Request(method, uri)..headers.addAll(headers);
      if (body != null) request.body = jsonEncode(body);

      final streamed = await _http.send(request).timeout(timeout);
      response = await http.Response.fromStream(streamed);
    } on TimeoutException catch (error) {
      throw ApiException.network(error);
    } catch (error) {
      // Socket errors, DNS failures, CORS rejections on web.
      throw ApiException.network(error);
    }

    // 204: the caller already knows what it deleted.
    if (response.statusCode == 204) {
      return ApiResponse<T>(data: decode(null));
    }

    Map<String, dynamic>? payload;
    if (response.body.isNotEmpty) {
      try {
        payload = jsonDecode(response.body) as Map<String, dynamic>;
      } on FormatException {
        payload = null;
      }
    }

    if (response.statusCode >= 400) {
      throw ApiException.fromResponse(response.statusCode, payload);
    }

    return ApiResponse<T>(
      data: decode(payload?['data']),
      nextCursor: payload?['nextCursor'] as String?,
      meta: payload?['meta'] as Map<String, dynamic>?,
    );
  }

  void close() => _http.close();
}

/// Decode a JSON list into models, skipping anything that is not an object.
List<T> decodeList<T>(Object? json, T Function(Map<String, dynamic>) fromJson) {
  if (json is! List) return const [];
  return json
      .whereType<Map<String, dynamic>>()
      .map(fromJson)
      .toList(growable: false);
}
