import 'dart:convert';

import 'package:http/http.dart' as http;

class AdsApiException implements Exception {
  AdsApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class AdCreative {
  AdCreative({
    required this.id,
    required this.type,
    required this.headline,
    required this.body,
    required this.imageUrl,
    required this.ctaLabel,
    required this.ctaUrl,
  });

  final String id;
  final String type;
  final String headline;
  final String body;
  final String imageUrl;
  final String ctaLabel;
  final String ctaUrl;
}

/// Talks to the backend's ad-serving endpoints. Active paid-tier subscribers
/// never get a creative back - see AdsService.isAdFree - so the deck/screen
/// simply renders nothing for that slot instead of a sponsored card.
class AdsApi {
  AdsApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<bool> fetchAdFree() async {
    final response = await _client.get(Uri.parse('$_baseUrl/ads/eligibility'), headers: _headers);

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw AdsApiException(_errorMessage(body, response.statusCode));
    }

    return body['adFree'] as bool;
  }

  /// Returns the ad creative for the given deck/screen slot, or null when
  /// the caller is ad-free.
  Future<AdCreative?> fetchNextAd({int slotIndex = 0}) async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/ads/next?slotIndex=$slotIndex'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw AdsApiException(_errorMessage(_decode(response), response.statusCode));
    }
    if (response.body.isEmpty || response.body == 'null') {
      return null;
    }

    final json = jsonDecode(response.body) as Map<String, dynamic>;
    return AdCreative(
      id: json['id'] as String,
      type: json['type'] as String,
      headline: json['headline'] as String,
      body: json['body'] as String,
      imageUrl: json['imageUrl'] as String,
      ctaLabel: json['ctaLabel'] as String,
      ctaUrl: json['ctaUrl'] as String,
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
