import 'dart:convert';

import 'package:http/http.dart' as http;

class CuratedProfilesApiException implements Exception {
  CuratedProfilesApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class CuratedProfile {
  CuratedProfile({
    required this.id,
    this.name,
    this.age,
    this.profilePhotoUrl,
    this.compatibilityPercentage,
    this.isStandout = false,
    this.isTopPick = false,
  });

  final String id;
  final String? name;
  final int? age;
  final String? profilePhotoUrl;
  final int? compatibilityPercentage;
  final bool isStandout;

  /// The single highest-ranked profile in today's batch - see the backend's
  /// "Most Compatible Pick" notification, which points at this same profile.
  final bool isTopPick;
}

/// Talks to the backend's daily curated profiles ("bagels") endpoint.
/// Requires a signed-in user's access token.
class CuratedProfilesApi {
  CuratedProfilesApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<DateTime> fetchNextRefreshAt() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/curated-profiles/refresh-countdown'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw CuratedProfilesApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return DateTime.parse(body['nextRefreshAt'] as String);
  }

  Future<List<CuratedProfile>> fetchDailyPicks() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/curated-profiles/daily'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw CuratedProfilesApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list
        .cast<Map<String, dynamic>>()
        .map(
          (json) => CuratedProfile(
            id: json['id'] as String,
            name: json['name'] as String?,
            age: json['age'] as int?,
            profilePhotoUrl: json['profilePhotoUrl'] as String?,
            compatibilityPercentage: json['compatibilityPercentage'] as int?,
            isStandout: json['isStandout'] as bool? ?? false,
            isTopPick: json['isTopPick'] as bool? ?? false,
          ),
        )
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
