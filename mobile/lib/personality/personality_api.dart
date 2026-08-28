import 'dart:convert';

import 'package:http/http.dart' as http;

class PersonalityApiException implements Exception {
  PersonalityApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class DimensionComparison {
  DimensionComparison({
    required this.dimension,
    required this.myScore,
    required this.theirScore,
    required this.similarity,
  });

  final String dimension;
  final int myScore;
  final int theirScore;
  final int similarity;
}

class CategoryBreakdown {
  CategoryBreakdown({
    required this.category,
    required this.averageSimilarity,
    required this.dimensions,
  });

  final String category;
  final int averageSimilarity;
  final List<DimensionComparison> dimensions;
}

class CompatibilityBreakdown {
  CompatibilityBreakdown({
    required this.percentage,
    required this.sharedDimensionCount,
    required this.categories,
  });

  final int? percentage;
  final int sharedDimensionCount;
  final List<CategoryBreakdown> categories;
}

class CompatibilityReportSection {
  CompatibilityReportSection({
    required this.title,
    required this.score,
    required this.insight,
    required this.dimensions,
  });

  final String title;
  final int score;
  final String insight;
  final List<DimensionComparison> dimensions;
}

/// A multi-page diagnostic report spotlighting communication strengths,
/// conflict resolution style, and emotional compatibility - each a separate
/// [CompatibilityReportSection] the client can render as its own page. See
/// PersonalityTestService.getCompatibilityReport on the backend.
class CompatibilityReport {
  CompatibilityReport({
    required this.percentage,
    required this.sharedDimensionCount,
    required this.sections,
  });

  final int? percentage;
  final int sharedDimensionCount;
  final List<CompatibilityReportSection> sections;
}

/// Talks to the backend's personality-test compatibility endpoints.
class PersonalityApi {
  PersonalityApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<CompatibilityBreakdown> fetchCompatibilityBreakdown(String otherUserId) async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/personality-test/compatibility/$otherUserId/breakdown'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw PersonalityApiException(_errorMessage(body, response.statusCode));
    }

    return CompatibilityBreakdown(
      percentage: body['percentage'] as int?,
      sharedDimensionCount: body['sharedDimensionCount'] as int,
      categories: (body['categories'] as List)
          .cast<Map<String, dynamic>>()
          .map(_toCategoryBreakdown)
          .toList(),
    );
  }

  CategoryBreakdown _toCategoryBreakdown(Map<String, dynamic> json) {
    return CategoryBreakdown(
      category: json['category'] as String,
      averageSimilarity: json['averageSimilarity'] as int,
      dimensions: (json['dimensions'] as List)
          .cast<Map<String, dynamic>>()
          .map(_toDimensionComparison)
          .toList(),
    );
  }

  DimensionComparison _toDimensionComparison(Map<String, dynamic> json) {
    return DimensionComparison(
      dimension: json['dimension'] as String,
      myScore: json['myScore'] as int,
      theirScore: json['theirScore'] as int,
      similarity: json['similarity'] as int,
    );
  }

  Future<CompatibilityReport> fetchCompatibilityReport(String otherUserId) async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/personality-test/compatibility/$otherUserId/report'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw PersonalityApiException(_errorMessage(body, response.statusCode));
    }

    return CompatibilityReport(
      percentage: body['percentage'] as int?,
      sharedDimensionCount: body['sharedDimensionCount'] as int,
      sections: (body['sections'] as List)
          .cast<Map<String, dynamic>>()
          .map(_toReportSection)
          .toList(),
    );
  }

  CompatibilityReportSection _toReportSection(Map<String, dynamic> json) {
    return CompatibilityReportSection(
      title: json['title'] as String,
      score: json['score'] as int,
      insight: json['insight'] as String,
      dimensions: (json['dimensions'] as List)
          .cast<Map<String, dynamic>>()
          .map(_toDimensionComparison)
          .toList(),
    );
  }

  /// "Compatibility score weighting customizer": how much each category
  /// (Emotional Values, Core Values, Communication Style, Social Habits)
  /// counts toward this user's own compatibility percentage with someone
  /// else. Each weight is 0-2; missing categories default to 1.
  Future<Map<String, double>> fetchCategoryWeights() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/personality-test/weights'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw PersonalityApiException(_errorMessage(body, response.statusCode));
    }

    return _toWeights(body);
  }

  Future<Map<String, double>> setCategoryWeights(Map<String, double> weights) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/personality-test/weights'),
      headers: _headers,
      body: jsonEncode({'weights': weights}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw PersonalityApiException(_errorMessage(body, response.statusCode));
    }

    return _toWeights(body);
  }

  Map<String, double> _toWeights(Map<String, dynamic> json) {
    return json.map((category, weight) => MapEntry(category, (weight as num).toDouble()));
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
