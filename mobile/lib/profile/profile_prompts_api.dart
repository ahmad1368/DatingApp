import 'dart:convert';

import 'package:http/http.dart' as http;

class ProfilePromptsApiException implements Exception {
  ProfilePromptsApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class ProfilePromptEntry {
  ProfilePromptEntry({required this.question, required this.answer});

  final String question;
  final String answer;

  Map<String, dynamic> toJson() => {'question': question, 'answer': answer};
}

/// Talks to the backend's profile prompt-card endpoints. The catalog is
/// public; reading/saving a user's own prompts requires an access token.
class ProfilePromptsApi {
  ProfilePromptsApi({this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String? accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _authHeaders => {
        'Content-Type': 'application/json',
        if (accessToken != null) 'Authorization': 'Bearer $accessToken',
      };

  Future<List<String>> fetchCatalog() async {
    final response = await _client.get(Uri.parse('$_baseUrl/profile/prompts/catalog'));

    if (response.statusCode != 200) {
      throw ProfilePromptsApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final body = _decode(response);
    return (body['questions'] as List).cast<String>();
  }

  Future<List<ProfilePromptEntry>> fetchPrompts() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/profile/prompts'),
      headers: _authHeaders,
    );

    if (response.statusCode != 200) {
      throw ProfilePromptsApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list
        .cast<Map<String, dynamic>>()
        .map((json) => ProfilePromptEntry(
              question: json['question'] as String,
              answer: json['answer'] as String,
            ))
        .toList();
  }

  Future<List<ProfilePromptEntry>> savePrompts(List<ProfilePromptEntry> prompts) async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/profile/prompts'),
      headers: _authHeaders,
      body: jsonEncode({'prompts': prompts.map((p) => p.toJson()).toList()}),
    );

    if (response.statusCode != 200) {
      throw ProfilePromptsApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list
        .cast<Map<String, dynamic>>()
        .map((json) => ProfilePromptEntry(
              question: json['question'] as String,
              answer: json['answer'] as String,
            ))
        .toList();
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
