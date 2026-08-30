import 'dart:convert';

import 'package:http/http.dart' as http;

class RelationshipProfileApiException implements Exception {
  RelationshipProfileApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class RelationshipProfileCatalog {
  RelationshipProfileCatalog({
    required this.relationshipStructures,
    required this.kinkTags,
    required this.relationshipDesires,
    required this.boundaryTags,
  });

  final List<String> relationshipStructures;
  final List<String> kinkTags;
  final List<String> relationshipDesires;
  final List<String> boundaryTags;
}

class RelationshipProfileResult {
  RelationshipProfileResult({
    this.relationshipStructure,
    required this.showRelationshipStructureOnProfile,
    required this.kinkTags,
    required this.showKinkTagsOnProfile,
    required this.relationshipDesires,
    required this.showRelationshipDesiresOnProfile,
    this.customRelationshipIntent,
    required this.showCustomRelationshipIntentOnProfile,
    this.communicationBoundaries,
    required this.showCommunicationBoundariesOnProfile,
    required this.boundaryTags,
    required this.showBoundaryTagsOnProfile,
  });

  final String? relationshipStructure;
  final bool showRelationshipStructureOnProfile;
  final List<String> kinkTags;
  final bool showKinkTagsOnProfile;
  final List<String> relationshipDesires;
  final bool showRelationshipDesiresOnProfile;
  final String? customRelationshipIntent;
  final bool showCustomRelationshipIntentOnProfile;
  final String? communicationBoundaries;
  final bool showCommunicationBoundariesOnProfile;

  /// Structured, upfront-honesty tags (e.g. "Sober / Substance-Free", "No
  /// Kids") - distinct from communicationBoundaries' freeform text.
  final List<String> boundaryTags;
  final bool showBoundaryTagsOnProfile;
}

/// Talks to the backend's relationship-profile endpoints ("relationship
/// intent badges" plus structure/kink tags). The catalog is public;
/// reading/saving a user's own selections requires an access token.
class RelationshipProfileApi {
  RelationshipProfileApi({this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String? accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _authHeaders => {
        'Content-Type': 'application/json',
        if (accessToken != null) 'Authorization': 'Bearer $accessToken',
      };

  Future<RelationshipProfileCatalog> fetchCatalog() async {
    final response = await _client.get(Uri.parse('$_baseUrl/profile/relationship/catalog'));

    if (response.statusCode != 200) {
      throw RelationshipProfileApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final body = _decode(response);
    return RelationshipProfileCatalog(
      relationshipStructures: (body['relationshipStructures'] as List).cast<String>(),
      kinkTags: (body['kinkTags'] as List).cast<String>(),
      relationshipDesires: (body['relationshipDesires'] as List).cast<String>(),
      boundaryTags: (body['boundaryTags'] as List?)?.cast<String>() ?? const [],
    );
  }

  Future<RelationshipProfileResult> fetchRelationshipProfile() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/profile/relationship'),
      headers: _authHeaders,
    );

    return _parse(response);
  }

  Future<RelationshipProfileResult> setRelationshipProfile({
    String? relationshipStructure,
    required bool showRelationshipStructureOnProfile,
    required List<String> kinkTags,
    required bool showKinkTagsOnProfile,
    required List<String> relationshipDesires,
    required bool showRelationshipDesiresOnProfile,
    String? customRelationshipIntent,
    required bool showCustomRelationshipIntentOnProfile,
    String? communicationBoundaries,
    required bool showCommunicationBoundariesOnProfile,
    required List<String> boundaryTags,
    required bool showBoundaryTagsOnProfile,
  }) async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/profile/relationship'),
      headers: _authHeaders,
      body: jsonEncode({
        'relationshipStructure': ?relationshipStructure,
        'showRelationshipStructureOnProfile': showRelationshipStructureOnProfile,
        'kinkTags': kinkTags,
        'showKinkTagsOnProfile': showKinkTagsOnProfile,
        'relationshipDesires': relationshipDesires,
        'showRelationshipDesiresOnProfile': showRelationshipDesiresOnProfile,
        'customRelationshipIntent': ?customRelationshipIntent,
        'showCustomRelationshipIntentOnProfile': showCustomRelationshipIntentOnProfile,
        'communicationBoundaries': ?communicationBoundaries,
        'showCommunicationBoundariesOnProfile': showCommunicationBoundariesOnProfile,
        'boundaryTags': boundaryTags,
        'showBoundaryTagsOnProfile': showBoundaryTagsOnProfile,
      }),
    );

    return _parse(response);
  }

  RelationshipProfileResult _parse(http.Response response) {
    final body = _decode(response);
    if (response.statusCode != 200) {
      throw RelationshipProfileApiException(_errorMessage(body, response.statusCode));
    }

    return RelationshipProfileResult(
      relationshipStructure: body['relationshipStructure'] as String?,
      showRelationshipStructureOnProfile: body['showRelationshipStructureOnProfile'] as bool,
      kinkTags: (body['kinkTags'] as List).cast<String>(),
      showKinkTagsOnProfile: body['showKinkTagsOnProfile'] as bool,
      relationshipDesires: (body['relationshipDesires'] as List).cast<String>(),
      showRelationshipDesiresOnProfile: body['showRelationshipDesiresOnProfile'] as bool,
      customRelationshipIntent: body['customRelationshipIntent'] as String?,
      showCustomRelationshipIntentOnProfile: body['showCustomRelationshipIntentOnProfile'] as bool,
      communicationBoundaries: body['communicationBoundaries'] as String?,
      showCommunicationBoundariesOnProfile: body['showCommunicationBoundariesOnProfile'] as bool,
      boundaryTags: (body['boundaryTags'] as List?)?.cast<String>() ?? const [],
      showBoundaryTagsOnProfile: body['showBoundaryTagsOnProfile'] as bool? ?? true,
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
