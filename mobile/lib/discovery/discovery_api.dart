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
    this.profilePhotoBlurred = false,
    this.videoSnippetUrl,
    this.distanceKm,
    required this.interests,
    this.sharedInterests = const [],
    this.relationshipGoal,
    this.relationshipIntentBadges = const [],
    this.lifestyleBadges = const [],
    this.zodiacSign,
    this.loveStyleBadges = const [],
    this.isSuperLike = false,
    this.isBoosted = false,
    this.isPriorityLike = false,
    this.complimentText,
    this.complimentTarget,
    this.mutualConnectionCount = 0,
    this.sharedSchool,
    this.communicationBoundaries,
    this.relationshipStructure,
    this.kinkTagBadges = const [],
    this.voiceIntroUrl,
    this.voiceIntroDurationSeconds,
    this.responseRateBadge,
  });

  final String id;
  final String? name;
  final int? age;
  final String? profilePhotoUrl;
  final bool profilePhotoBlurred;
  final String? videoSnippetUrl;
  final String? voiceIntroUrl;
  final int? voiceIntroDurationSeconds;
  final double? distanceKm;
  final List<String> interests;
  final List<String> sharedInterests;
  final String? relationshipGoal;
  final List<String> relationshipIntentBadges;
  final List<String> lifestyleBadges;
  final String? zodiacSign;
  final List<String> loveStyleBadges;
  final bool isSuperLike;
  final bool isBoosted;
  final bool isPriorityLike;
  final String? complimentText;
  final String? complimentTarget;
  final int mutualConnectionCount;
  final String? sharedSchool;
  final String? communicationBoundaries;
  final String? relationshipStructure;
  final List<String> kinkTagBadges;
  final String? responseRateBadge;
}

/// A card in the "vertical video feed" - only candidates with an actual
/// video (a profile video snippet, or a video answer to a profile prompt)
/// appear here, so swiping is always on video content.
class VideoFeedCard {
  VideoFeedCard({
    required this.id,
    this.name,
    this.age,
    required this.videoUrl,
    required this.videoSource,
    this.promptQuestion,
  });

  final String id;
  final String? name;
  final int? age;
  final String videoUrl;

  /// 'SNIPPET' or 'PROMPT_ANSWER'.
  final String videoSource;
  final String? promptQuestion;
}

class SnoozeStatus {
  SnoozeStatus({this.snoozedUntil, this.statusMessage});

  final DateTime? snoozedUntil;
  final String? statusMessage;
}

class BoostStatus {
  BoostStatus({
    required this.active,
    this.expiresAt,
    required this.viewCount,
    this.tier,
    this.viewMultiplier = 1,
  });

  final bool active;
  final DateTime? expiresAt;
  final int viewCount;
  final String? tier;
  final int viewMultiplier;
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

  Future<List<String>> fetchPassReasons() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/discovery/pass-reasons'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw DiscoveryApiException(_errorMessage(_decode(response), response.statusCode));
    }

    return (jsonDecode(response.body) as List).cast<String>();
  }

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

  /// "Vertical video feed": a discovery surface restricted to candidates
  /// who have actual video content, so every card is swiped directly on
  /// video. Swiping a card still goes through [recordSwipe].
  Future<List<VideoFeedCard>> fetchVideoFeed() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/discovery/video-feed'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw DiscoveryApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list
        .cast<Map<String, dynamic>>()
        .map(
          (json) => VideoFeedCard(
            id: json['id'] as String,
            name: json['name'] as String?,
            age: json['age'] as int?,
            videoUrl: json['videoUrl'] as String,
            videoSource: json['videoSource'] as String,
            promptQuestion: json['promptQuestion'] as String?,
          ),
        )
        .toList();
  }

  DeckCard _toDeckCard(Map<String, dynamic> json) {
    return DeckCard(
      id: json['id'] as String,
      name: json['name'] as String?,
      age: json['age'] as int?,
      profilePhotoUrl: json['profilePhotoUrl'] as String?,
      profilePhotoBlurred: json['profilePhotoBlurred'] as bool? ?? false,
      videoSnippetUrl: json['videoSnippetUrl'] as String?,
      distanceKm: (json['distanceKm'] as num?)?.toDouble(),
      interests: (json['interests'] as List).cast<String>(),
      sharedInterests: (json['sharedInterests'] as List?)?.cast<String>() ?? const [],
      relationshipGoal: json['relationshipGoal'] as String?,
      relationshipIntentBadges:
          (json['relationshipIntentBadges'] as List?)?.cast<String>() ?? const [],
      lifestyleBadges: (json['lifestyleBadges'] as List?)?.cast<String>() ?? const [],
      zodiacSign: json['zodiacSign'] as String?,
      loveStyleBadges: (json['loveStyleBadges'] as List?)?.cast<String>() ?? const [],
      isSuperLike: json['isSuperLike'] as bool? ?? false,
      isBoosted: json['isBoosted'] as bool? ?? false,
      isPriorityLike: json['isPriorityLike'] as bool? ?? false,
      complimentText: json['complimentText'] as String?,
      complimentTarget: json['complimentTarget'] as String?,
      mutualConnectionCount: json['mutualConnectionCount'] as int? ?? 0,
      sharedSchool: json['sharedSchool'] as String?,
      communicationBoundaries: json['communicationBoundaries'] as String?,
      relationshipStructure: json['relationshipStructure'] as String?,
      kinkTagBadges: (json['kinkTagBadges'] as List?)?.cast<String>() ?? const [],
      voiceIntroUrl: json['voiceIntroUrl'] as String?,
      voiceIntroDurationSeconds: json['voiceIntroDurationSeconds'] as int?,
      responseRateBadge: json['responseRateBadge'] as String?,
    );
  }

  /// [complimentText] attaches a short pre-match compliment to this like
  /// (e.g. praising a specific photo or prompt, named by [complimentTarget]);
  /// the backend rejects a compliment on a PASS. [passReason] is the
  /// opposite: an optional quick-pick reason (from [fetchPassReasons]) the
  /// backend only accepts on a PASS.
  Future<SwipeResult> recordSwipe({
    required String targetUserId,
    required String action,
    String? complimentText,
    String? complimentTarget,
    String? icebreakerPromptId,
    int? icebreakerOptionIndex,
    String? passReason,
    bool? usePriorityLike,
  }) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/discovery/swipe'),
      headers: _headers,
      body: jsonEncode({
        'targetUserId': targetUserId,
        'action': action,
        'complimentText': ?complimentText,
        'complimentTarget': ?complimentTarget,
        'icebreakerPromptId': ?icebreakerPromptId,
        'icebreakerOptionIndex': ?icebreakerOptionIndex,
        'passReason': ?passReason,
        'usePriorityLike': ?usePriorityLike,
      }),
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

  /// Algorithm-driven match quality feedback: submits a 'GOOD'/'OKAY'/'BAD'
  /// rating (the client is responsible for prompting every N swipes) and
  /// returns the resulting proximity weight the backend will apply to the
  /// next deck fetch.
  Future<double> submitDeckFeedback(String rating) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/discovery/deck-feedback'),
      headers: _headers,
      body: jsonEncode({'rating': rating}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw DiscoveryApiException(_errorMessage(body, response.statusCode));
    }

    return (body['discoveryProximityWeight'] as num).toDouble();
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

  /// High-tier "Super Boost": like [activateBoost], but reserved for
  /// Platinum subscribers and worth up to 100x the profile views during
  /// local peak activity hours. Throws [DiscoveryApiException] (403) if the
  /// user isn't Platinum, or (400) if a boost is already active.
  Future<BoostStatus> activateSuperBoost() async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/discovery/boost/super'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 201) {
      throw DiscoveryApiException(_errorMessage(body, response.statusCode));
    }

    return _toBoostStatus(body);
  }

  /// Premium "who liked you": everyone who has already swiped right on the
  /// current user. Defaults to most-recently-liked first; pass 'PROXIMITY'
  /// or 'COMPATIBILITY' to re-sort the same backlog by distance or
  /// compatibility score instead. Throws [DiscoveryApiException] (403) if
  /// the user isn't premium.
  Future<List<DeckCard>> fetchLikedByGrid({String? sortBy}) async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/discovery/likes').replace(
        queryParameters: sortBy != null ? {'sortBy': sortBy} : null,
      ),
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
  /// date, or omit it for the backend's default duration. [statusMessage]
  /// is shown to matches in active chats while snoozed (e.g. "On
  /// Vacation"). Disabling always succeeds and clears the status message;
  /// enabling with a past or too-far-future `until` throws
  /// [DiscoveryApiException] (400).
  Future<SnoozeStatus> setSnoozeMode(bool enabled, {DateTime? until, String? statusMessage}) async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/discovery/snooze'),
      headers: _headers,
      body: jsonEncode({
        'enabled': enabled,
        if (until != null) 'until': until.toUtc().toIso8601String(),
        'statusMessage': ?statusMessage,
      }),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw DiscoveryApiException(_errorMessage(body, response.statusCode));
    }

    return _toSnoozeStatus(body);
  }

  Future<SnoozeStatus> fetchSnoozeStatus() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/discovery/snooze'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw DiscoveryApiException(_errorMessage(body, response.statusCode));
    }

    return _toSnoozeStatus(body);
  }

  SnoozeStatus _toSnoozeStatus(Map<String, dynamic> json) {
    final snoozedUntil = json['snoozedUntil'];
    return SnoozeStatus(
      snoozedUntil: snoozedUntil != null ? DateTime.parse(snoozedUntil as String) : null,
      statusMessage: json['statusMessage'] as String?,
    );
  }

  BoostStatus _toBoostStatus(Map<String, dynamic> json) {
    return BoostStatus(
      active: json['active'] as bool,
      expiresAt: json['expiresAt'] != null ? DateTime.parse(json['expiresAt'] as String) : null,
      viewCount: json['viewCount'] as int,
      tier: json['tier'] as String?,
      viewMultiplier: json['viewMultiplier'] as int? ?? 1,
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
