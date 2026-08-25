import 'dart:convert';

import 'package:http/http.dart' as http;

class CommunityGroupsApiException implements Exception {
  CommunityGroupsApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class CommunityGroup {
  CommunityGroup({required this.id, required this.name, required this.description});

  final String id;
  final String name;
  final String description;
}

class GroupMember {
  GroupMember({required this.id, this.name, this.age, this.profilePhotoUrl});

  final String id;
  final String? name;
  final int? age;
  final String? profilePhotoUrl;
}

/// Talks to the backend's community-groups endpoints: joining/leaving
/// topic-based hubs (e.g. "Outdoor Adventurers") that a user's deck can
/// later be filtered by - see LifestyleFiltersApi's filterCommunityGroups.
class CommunityGroupsApi {
  CommunityGroupsApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<List<CommunityGroup>> fetchGroups() async {
    final response = await _client.get(Uri.parse('$_baseUrl/community-groups'));

    if (response.statusCode != 200) {
      throw CommunityGroupsApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list
        .cast<Map<String, dynamic>>()
        .map(
          (json) => CommunityGroup(
            id: json['id'] as String,
            name: json['name'] as String,
            description: json['description'] as String,
          ),
        )
        .toList();
  }

  Future<List<String>> fetchMyGroups() async {
    final response = await _client.get(Uri.parse('$_baseUrl/community-groups/me'), headers: _headers);

    if (response.statusCode != 200) {
      throw CommunityGroupsApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<String>();
  }

  Future<List<String>> joinGroup(String groupId) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/community-groups/me'),
      headers: _headers,
      body: jsonEncode({'groupId': groupId}),
    );

    if (response.statusCode != 200) {
      throw CommunityGroupsApiException(_errorMessage(_decode(response), response.statusCode));
    }

    return (jsonDecode(response.body) as List).cast<String>();
  }

  Future<List<String>> leaveGroup(String groupId) async {
    final response = await _client.delete(
      Uri.parse('$_baseUrl/community-groups/me/$groupId'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw CommunityGroupsApiException(_errorMessage(_decode(response), response.statusCode));
    }

    return (jsonDecode(response.body) as List).cast<String>();
  }

  /// Other members of one community group, so a user can browse profiles
  /// active within that specific niche rather than only their broader deck.
  Future<List<GroupMember>> fetchGroupMembers(String groupId) async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/community-groups/$groupId/members'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw CommunityGroupsApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list
        .cast<Map<String, dynamic>>()
        .map(
          (json) => GroupMember(
            id: json['id'] as String,
            name: json['name'] as String?,
            age: json['age'] as int?,
            profilePhotoUrl: json['profilePhotoUrl'] as String?,
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
