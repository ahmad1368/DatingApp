import 'dart:convert';

import 'package:http/http.dart' as http;

class MatchAnalyticsApiException implements Exception {
  MatchAnalyticsApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Self-facing "Post-Match Conversion Analytics Dashboard": how often this
/// user's likes turn into matches, and how quickly they send the first
/// message once matched.
class MatchInsights {
  MatchInsights({
    required this.totalLikesSent,
    required this.totalMatches,
    this.likeAcceptanceRate,
    this.averageMessageInitiationSeconds,
  });

  final int totalLikesSent;
  final int totalMatches;
  final double? likeAcceptanceRate;
  final double? averageMessageInitiationSeconds;
}

class MatchAnalyticsApi {
  MatchAnalyticsApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<MatchInsights> fetchMatchInsights() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/match-analytics/insights'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw MatchAnalyticsApiException(_errorMessage(body, response.statusCode));
    }

    return MatchInsights(
      totalLikesSent: body['totalLikesSent'] as int,
      totalMatches: body['totalMatches'] as int,
      likeAcceptanceRate: (body['likeAcceptanceRate'] as num?)?.toDouble(),
      averageMessageInitiationSeconds: (body['averageMessageInitiationSeconds'] as num?)?.toDouble(),
    );
  }

  Map<String, dynamic> _decode(http.Response response) {
    if (response.body.isEmpty) {
      return {};
    }
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  String _errorMessage(Map<String, dynamic> body, int statusCode) {
    return body['message'] as String? ?? 'Request failed with status $statusCode.';
  }
}
