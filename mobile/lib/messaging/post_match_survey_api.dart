import 'dart:convert';

import 'package:http/http.dart' as http;

class PostMatchSurveyApiException implements Exception {
  PostMatchSurveyApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class PostMatchSurvey {
  PostMatchSurvey({
    required this.matchId,
    required this.metInPerson,
    this.matchQuality,
    required this.createdAt,
  });

  final String matchId;
  final bool metInPerson;
  final String? matchQuality;
  final DateTime createdAt;
}

/// Talks to the backend's private post-match "did you meet up" survey.
class PostMatchSurveyApi {
  PostMatchSurveyApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<PostMatchSurvey?> fetchMySurvey(String matchId) async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/post-match-survey/$matchId'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw PostMatchSurveyApiException(_errorMessage(_decode(response), response.statusCode));
    }
    if (response.body == 'null' || response.body.isEmpty) {
      return null;
    }

    return _toSurvey(_decode(response));
  }

  Future<PostMatchSurvey> submitSurvey({
    required String matchId,
    required bool metInPerson,
    String? matchQuality,
  }) async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/post-match-survey/$matchId'),
      headers: _headers,
      body: jsonEncode({'metInPerson': metInPerson, 'matchQuality': ?matchQuality}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw PostMatchSurveyApiException(_errorMessage(body, response.statusCode));
    }

    return _toSurvey(body);
  }

  PostMatchSurvey _toSurvey(Map<String, dynamic> json) {
    return PostMatchSurvey(
      matchId: json['matchId'] as String,
      metInPerson: json['metInPerson'] as bool,
      matchQuality: json['matchQuality'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
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
