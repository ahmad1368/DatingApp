import 'dart:convert';

import 'package:http/http.dart' as http;

class TopicQuizApiException implements Exception {
  TopicQuizApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class TopicQuizQuestion {
  TopicQuizQuestion({required this.id, required this.category, required this.statement});

  final String id;
  final String category;
  final String statement;
}

class TopicAlignmentItem {
  TopicAlignmentItem({
    required this.questionId,
    required this.category,
    required this.statement,
    required this.myStance,
    required this.theirStance,
    required this.agreement,
  });

  final String questionId;
  final String category;
  final String statement;
  final String myStance;
  final String theirStance;
  final String agreement;
}

class TopicAlignmentResult {
  TopicAlignmentResult({
    required this.alignmentPercentage,
    required this.sharedTopicCount,
    required this.items,
  });

  final int? alignmentPercentage;
  final int sharedTopicCount;
  final List<TopicAlignmentItem> items;
}

/// Talks to the backend's topic-quiz endpoints: discrete political/cultural/
/// lifestyle stances compared as side-by-side agree/disagree indicators,
/// distinct from the personality test's continuous trait similarity.
class TopicQuizApi {
  TopicQuizApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<List<TopicQuizQuestion>> fetchQuestions() async {
    final response = await _client.get(Uri.parse('$_baseUrl/topic-quiz/questions'));

    if (response.statusCode != 200) {
      throw TopicQuizApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map(_toQuestion).toList();
  }

  Future<void> submitQuiz(List<MapEntry<String, String>> responses) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/topic-quiz/responses'),
      headers: _headers,
      body: jsonEncode({
        'responses': [
          for (final entry in responses) {'questionId': entry.key, 'stance': entry.value},
        ],
      }),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw TopicQuizApiException(_errorMessage(body, response.statusCode));
    }
  }

  Future<TopicAlignmentResult> fetchAlignment(String otherUserId) async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/topic-quiz/alignment/$otherUserId'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw TopicQuizApiException(_errorMessage(body, response.statusCode));
    }

    return TopicAlignmentResult(
      alignmentPercentage: body['alignmentPercentage'] as int?,
      sharedTopicCount: body['sharedTopicCount'] as int,
      items: (body['items'] as List).cast<Map<String, dynamic>>().map(_toAlignmentItem).toList(),
    );
  }

  TopicQuizQuestion _toQuestion(Map<String, dynamic> json) {
    return TopicQuizQuestion(
      id: json['id'] as String,
      category: json['category'] as String,
      statement: json['statement'] as String,
    );
  }

  TopicAlignmentItem _toAlignmentItem(Map<String, dynamic> json) {
    return TopicAlignmentItem(
      questionId: json['questionId'] as String,
      category: json['category'] as String,
      statement: json['statement'] as String,
      myStance: json['myStance'] as String,
      theirStance: json['theirStance'] as String,
      agreement: json['agreement'] as String,
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
