import 'dart:convert';

import 'package:http/http.dart' as http;

class ProfileVisitsApiException implements Exception {
  ProfileVisitsApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class ProfileVisitor {
  ProfileVisitor({
    required this.visitorId,
    this.visitorName,
    this.visitorPhotoUrl,
    required this.visitedAt,
  });

  final String visitorId;
  final String? visitorName;
  final String? visitorPhotoUrl;
  final DateTime visitedAt;
}

/// Talks to the backend's profile-visit tracking endpoints. Requires a
/// signed-in user's access token.
class ProfileVisitsApi {
  ProfileVisitsApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  /// Records that the current user viewed [visitedUserId]'s profile. Pass
  /// [anonymous] true to skip recording the visit entirely (premium-only) so
  /// it never appears in their "Profile Visitors" list.
  Future<void> recordVisit(String visitedUserId, {bool anonymous = false}) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/profile-visits/$visitedUserId'),
      headers: _headers,
      body: jsonEncode({'anonymous': anonymous}),
    );

    if (response.statusCode != 201) {
      throw ProfileVisitsApiException(_errorMessage(_decode(response), response.statusCode));
    }
  }

  /// Premium "profile visitors": everyone who has viewed your profile, most
  /// recent first. Throws [ProfileVisitsApiException] (403) if the user
  /// isn't premium.
  Future<List<ProfileVisitor>> fetchVisitors() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/profile-visits'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw ProfileVisitsApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map((json) {
      return ProfileVisitor(
        visitorId: json['visitorId'] as String,
        visitorName: json['visitorName'] as String?,
        visitorPhotoUrl: json['visitorPhotoUrl'] as String?,
        visitedAt: DateTime.parse(json['visitedAt'] as String),
      );
    }).toList();
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
