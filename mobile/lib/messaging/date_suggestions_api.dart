import 'dart:convert';

import 'package:http/http.dart' as http;

class DateSuggestionsApiException implements Exception {
  DateSuggestionsApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class VenueSuggestion {
  VenueSuggestion({
    required this.id,
    required this.label,
    required this.description,
    required this.mapsSearchUrl,
  });

  final String id;
  final String label;
  final String description;
  final String mapsSearchUrl;
}

class MeetupSuggestions {
  MeetupSuggestions({required this.distanceKm, required this.suggestions});

  final double distanceKm;
  final List<VenueSuggestion> suggestions;
}

/// Talks to the backend's date-location suggestion endpoint. Requires a
/// signed-in user's access token.
class DateSuggestionsApi {
  DateSuggestionsApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  /// Public meetup-spot categories (cafes, bars, parks, ...) near the
  /// midpoint between both users in the match, each with a map link the
  /// user can open to search real venues nearby.
  Future<MeetupSuggestions> fetchMeetupSuggestions(String matchId) async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/date-suggestions/$matchId'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw DateSuggestionsApiException(_errorMessage(body, response.statusCode));
    }

    final suggestions = (body['suggestions'] as List).cast<Map<String, dynamic>>().map((json) {
      return VenueSuggestion(
        id: json['id'] as String,
        label: json['label'] as String,
        description: json['description'] as String,
        mapsSearchUrl: json['mapsSearchUrl'] as String,
      );
    }).toList();

    return MeetupSuggestions(
      distanceKm: (body['distanceKm'] as num).toDouble(),
      suggestions: suggestions,
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
