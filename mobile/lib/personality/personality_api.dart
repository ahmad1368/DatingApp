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
