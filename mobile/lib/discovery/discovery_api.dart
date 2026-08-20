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
    this.relationshipIntentBadges = const [],
    this.isSuperLike = false,
    this.isBoosted = false,
  });

  final String id;
  final String? name;
  final int? age;
  final String? profilePhotoUrl;
  final double? distanceKm;
  final List<String> interests;
  final String? relationshipGoal;
  final List<String> relationshipIntentBadges;
  final bool isSuperLike;
  final bool isBoosted;
}

class BoostStatus {
  BoostStatus({required this.active, this.expiresAt, required this.viewCount});

  final bool active;
  final DateTime? expiresAt;
  final int viewCount;
}

class SwipeResult {
  SwipeResult({required this.matched, this.matchId});

  final bool matched;
  final String? matchId;
}

class UndoResult {
  UndoResult({required this.targetUserId, required this.action, required this.hadMatch});

  final String targetUserId;
  final String action;
  final bool hadMatch;
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
    return list.cast<Map<String, dynamic>>().map(_toDeckCard).toList();
  }

  DeckCard _toDeckCard(Map<String, dynamic> json) {
    return DeckCard(
      id: json['id'] as String,
      name: json['name'] as String?,
      age: json['age'] as int?,
      profilePhotoUrl: json['profilePhotoUrl'] as String?,
      distanceKm: (json['distanceKm'] as num?)?.toDouble(),
      interests: (json['interests'] as List).cast<String>(),
      relationshipGoal: json['relationshipGoal'] as String?,
      relationshipIntentBadges:
          (json['relationshipIntentBadges'] as List?)?.cast<String>() ?? const [],
      isSuperLike: json['isSuperLike'] as bool? ?? false,
      isBoosted: json['isBoosted'] as bool? ?? false,
    );
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

  /// Premium "rewind": undoes the user's most recent swipe. Throws
  /// [DiscoveryApiException] (403) if the user isn't premium, or (400) if
  /// there's nothing to undo or the swipe already led to a conversation.
  Future<UndoResult> undoLastSwipe() async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/discovery/undo'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw DiscoveryApiException(_errorMessage(body, response.statusCode));
    }

    return UndoResult(
      targetUserId: body['targetUserId'] as String,
      action: body['action'] as String,
      hadMatch: body['hadMatch'] as bool,
    );
  }

  /// Premium "incognito" mode: hides the user from the main deck except for
  /// profiles they've actively liked or super-liked. Throws
  /// [DiscoveryApiException] (403) when enabling for a non-premium user;
  /// disabling is always allowed.
  Future<bool> setIncognitoMode(bool enabled) async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/discovery/incognito'),
      headers: _headers,
      body: jsonEncode({'enabled': enabled}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw DiscoveryApiException(_errorMessage(body, response.statusCode));
    }

    return body['incognitoEnabled'] as bool;
  }

  /// Premium "boost": pushes the user to the top of nearby decks for 30
  /// minutes. Throws [DiscoveryApiException] (403) if the user isn't
  /// premium, or (400) if a boost is already active.
  Future<BoostStatus> activateBoost() async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/discovery/boost'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 201) {
      throw DiscoveryApiException(_errorMessage(body, response.statusCode));
    }

    return _toBoostStatus(body);
  }

  Future<BoostStatus> fetchBoostStatus() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/discovery/boost'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw DiscoveryApiException(_errorMessage(body, response.statusCode));
    }

    return _toBoostStatus(body);
  }

  /// Premium "who liked you": everyone who has already swiped right on the
  /// current user, most recent first. Throws [DiscoveryApiException] (403)
  /// if the user isn't premium.
  Future<List<DeckCard>> fetchLikedByGrid() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/discovery/likes'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw DiscoveryApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map(_toDeckCard).toList();
  }

  /// Switches which network the user browses/matches in: 'DATING', 'BFF',
  /// or 'BIZZ'. The deck only shows candidates currently browsing the same
  /// mode.
  Future<String> setActiveMode(String mode) async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/discovery/mode'),
      headers: _headers,
      body: jsonEncode({'mode': mode}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw DiscoveryApiException(_errorMessage(body, response.statusCode));
    }

    return body['activeMode'] as String;
  }

  /// "Snooze"/travel mode: temporarily hides the user from other people's
  /// discovery decks and the daily picks feed without touching their
  /// existing swipes or matches. Pass `until` (ISO-8601) for a custom end
  /// date, or omit it for the backend's default duration. Disabling always
  /// succeeds; enabling with a past or too-far-future `until` throws
  /// [DiscoveryApiException] (400).
  Future<DateTime?> setSnoozeMode(bool enabled, {DateTime? until}) async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/discovery/snooze'),
      headers: _headers,
      body: jsonEncode({
        'enabled': enabled,
        if (until != null) 'until': until.toUtc().toIso8601String(),
      }),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw DiscoveryApiException(_errorMessage(body, response.statusCode));
    }

    return _toSnoozedUntil(body);
  }

  Future<DateTime?> fetchSnoozeStatus() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/discovery/snooze'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw DiscoveryApiException(_errorMessage(body, response.statusCode));
    }

    return _toSnoozedUntil(body);
  }

  DateTime? _toSnoozedUntil(Map<String, dynamic> json) {
    final snoozedUntil = json['snoozedUntil'];
    return snoozedUntil != null ? DateTime.parse(snoozedUntil as String) : null;
  }

  BoostStatus _toBoostStatus(Map<String, dynamic> json) {
    return BoostStatus(
      active: json['active'] as bool,
      expiresAt: json['expiresAt'] != null ? DateTime.parse(json['expiresAt'] as String) : null,
      viewCount: json['viewCount'] as int,
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
