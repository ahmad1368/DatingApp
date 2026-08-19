import 'dart:convert';

import 'package:http/http.dart' as http;

class DiscoveryApiException implements Exception {
  DiscoveryApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class DeckCard {
  DeckCard({
    required this.id,
    this.name,
    this.age,
    this.profilePhotoUrl,
    this.distanceKm,
    required this.interests,
    this.relationshipGoal,
    this.isSuperLike = false,
  });

  final String id;
  final String? name;
  final int? age;
  final String? profilePhotoUrl;
  final double? distanceKm;
  final List<String> interests;
  final String? relationshipGoal;
  final bool isSuperLike;
}

class SwipeResult {
  SwipeResult({required this.matched, this.matchId});

  final bool matched;
  final String? matchId;
}

/// Talks to the backend's swipe deck endpoints. Requires a signed-in
/// user's access token.
class DiscoveryApi {
  DiscoveryApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<List<DeckCard>> fetchDeck() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/discovery/deck'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw DiscoveryApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list
        .cast<Map<String, dynamic>>()
        .map(
          (json) => DeckCard(
            id: json['id'] as String,
            name: json['name'] as String?,
            age: json['age'] as int?,
            profilePhotoUrl: json['profilePhotoUrl'] as String?,
            distanceKm: (json['distanceKm'] as num?)?.toDouble(),
            interests: (json['interests'] as List).cast<String>(),
            relationshipGoal: json['relationshipGoal'] as String?,
            isSuperLike: json['isSuperLike'] as bool? ?? false,
          ),
        )
        .toList();
  }

  Future<SwipeResult> recordSwipe({required String targetUserId, required String action}) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/discovery/swipe'),
      headers: _headers,
      body: jsonEncode({'targetUserId': targetUserId, 'action': action}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw DiscoveryApiException(_errorMessage(body, response.statusCode));
    }

    return SwipeResult(
      matched: body['matched'] as bool,
      matchId: body['matchId'] as String?,
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
