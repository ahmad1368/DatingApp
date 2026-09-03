import 'dart:convert';

import 'package:http/http.dart' as http;

class ProfileShareApiException implements Exception {
  ProfileShareApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Talks to the backend's "Direct Profile Link & QR Code Sharing" endpoint.
class ProfileShareApi {
  ProfileShareApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  /// Generates (or reuses) a share link for the caller's own profile card -
  /// a public, unauthenticated page anyone can open outside the app.
  /// Returns the full link, not just the token.
  Future<String> getOrCreateShareLink() async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/profile/share-link'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 201) {
      throw ProfileShareApiException(_errorMessage(body, response.statusCode));
    }

    return '$_baseUrl/profile/shared/${body['shareToken']}';
  }

  Map<String, dynamic> _decode(http.Response response) {
    if (response.body.isEmpty) {
      return const {};
    }
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  String _errorMessage(Map<String, dynamic> body, int statusCode) {
    final message = body['message'];
    if (message is String) {
      return message;
    }
    if (message is List && message.isNotEmpty) {
      return message.first.toString();
    }
    return 'Request failed with status $statusCode';
  }
}
