import 'dart:convert';

import 'package:http/http.dart' as http;

class MatchingApiException implements Exception {
  MatchingApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class QuestionnaireQuestion {
  QuestionnaireQuestion({required this.id, required this.text, required this.options});

  final String id;
  final String text;
  final List<String> options;
}

class QuestionnaireAnswer {
  QuestionnaireAnswer({
    required this.questionId,
    required this.answer,
    required this.acceptableAnswers,
    required this.importance,
  });

  final String questionId;
  final String answer;
  final List<String> acceptableAnswers;
  final String importance;
}

class CompatibilityResult {
  CompatibilityResult({
    required this.percentage,
    required this.sharedQuestionCount,
    this.zodiacSign,
    this.otherZodiacSign,
    this.zodiacHarmony,
  });

  final int? percentage;
  final int sharedQuestionCount;
  final String? zodiacSign;
  final String? otherZodiacSign;
  final String? zodiacHarmony;
}

/// The importance levels a user can assign to a questionnaire answer, from
/// least to most weighted in the compatibility calculation. `MANDATORY` acts
/// as a hard dealbreaker: an unmet mandatory answer zeroes out compatibility
/// with that person entirely.
const List<String> answerImportanceLevels = [
  'IRRELEVANT',
  'A_LITTLE_IMPORTANT',
  'SOMEWHAT_IMPORTANT',
  'VERY_IMPORTANT',
  'MANDATORY',
];

/// Talks to the backend's questionnaire/compatibility endpoints. Requires a
/// signed-in user's access token.
class MatchingApi {
  MatchingApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<List<QuestionnaireQuestion>> fetchQuestions() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/questionnaire/questions'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw MatchingApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map((json) {
      return QuestionnaireQuestion(
        id: json['id'] as String,
        text: json['text'] as String,
        options: (json['options'] as List).cast<String>(),
      );
    }).toList();
  }

  Future<QuestionnaireAnswer> submitAnswer({
    required String questionId,
    required String answer,
    required List<String> acceptableAnswers,
    required String importance,
  }) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/questionnaire/answers'),
      headers: _headers,
      body: jsonEncode({
        'questionId': questionId,
        'answer': answer,
        'acceptableAnswers': acceptableAnswers,
        'importance': importance,
      }),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw MatchingApiException(_errorMessage(body, response.statusCode));
    }

    return QuestionnaireAnswer(
      questionId: body['questionId'] as String,
      answer: body['answer'] as String,
      acceptableAnswers: (body['acceptableAnswers'] as List).cast<String>(),
      importance: body['importance'] as String,
    );
  }

  Future<CompatibilityResult> getCompatibility(String otherUserId) async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/questionnaire/compatibility/$otherUserId'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw MatchingApiException(_errorMessage(body, response.statusCode));
    }

    return CompatibilityResult(
      percentage: body['percentage'] as int?,
      sharedQuestionCount: body['sharedQuestionCount'] as int,
      zodiacSign: body['zodiacSign'] as String?,
      otherZodiacSign: body['otherZodiacSign'] as String?,
      zodiacHarmony: body['zodiacHarmony'] as String?,
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
