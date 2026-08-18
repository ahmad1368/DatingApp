import 'dart:convert';

import 'package:http/http.dart' as http;

class PassportApiException implements Exception {
  PassportApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class PassportResult {
  PassportResult({required this.passportEnabled, this.latitude, this.longitude});

  final bool passportEnabled;
  final double? latitude;
  final double? longitude;
}

/// Talks to the backend's Passport (premium virtual-location) endpoints.
/// Requires a signed-in user's access token.
class PassportApi {
  PassportApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<PassportResult> setPassportLocation({
    required double latitude,
    required double longitude,
  }) async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/location/passport'),
      headers: _headers,
      body: jsonEncode({'latitude': latitude, 'longitude': longitude}),
    );

    return _parse(response);
  }

  Future<PassportResult> clearPassportLocation() async {
    final response = await _client.delete(
      Uri.parse('$_baseUrl/location/passport'),
      headers: _headers,
    );

    return _parse(response);
  }

  PassportResult _parse(http.Response response) {
    final body = _decode(response);
    if (response.statusCode != 200) {
      throw PassportApiException(_errorMessage(body, response.statusCode));
    }

    return PassportResult(
      passportEnabled: body['passportEnabled'] as bool,
      latitude: (body['latitude'] as num?)?.toDouble(),
      longitude: (body['longitude'] as num?)?.toDouble(),
    );
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
