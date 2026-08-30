import 'dart:convert';

import 'package:http/http.dart' as http;

class MessagingApiException implements Exception {
  MessagingApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class MatchStatus {
  MatchStatus({
    required this.matchId,
    this.expiresAt,
    required this.isExpired,
    required this.firstMessageSent,
    required this.canSendFirstMessage,
    required this.canExtend,
    this.otherUserIsVerified = false,
    this.verificationRequested = false,
    this.verificationRequestedByMe = false,
    this.otherUserSnoozeStatusMessage,
    this.otherUserLastActiveAt,
  });

  final String matchId;
  final DateTime? expiresAt;
  final bool isExpired;
  final bool firstMessageSent;
  final bool canSendFirstMessage;
  final bool canExtend;
  final bool otherUserIsVerified;
  final bool verificationRequested;
  final bool verificationRequestedByMe;
  final String? otherUserSnoozeStatusMessage;

  /// Null both when the other user has no recorded activity yet and when
  /// incognito ghosting protection is hiding it because this chat has gone
  /// quiet for a week - the two cases are indistinguishable to the client
  /// by design.
  final DateTime? otherUserLastActiveAt;
}

class MatchNote {
  MatchNote({this.content, this.updatedAt});

  final String? content;
  final DateTime? updatedAt;
}

class MatchSummary {
  MatchSummary({
    required this.matchId,
    required this.otherUserId,
    this.otherUserName,
    this.otherUserPhotoUrl,
    this.expiresAt,
    required this.firstMessageSent,
    required this.canExtend,
    required this.createdAt,
    this.needsGhostingPrompt = false,
  });

  final String matchId;
  final String otherUserId;
  final String? otherUserName;
  final String? otherUserPhotoUrl;
  final DateTime? expiresAt;
  final bool firstMessageSent;
  final bool canExtend;
  final DateTime createdAt;
  final bool needsGhostingPrompt;
}

/// A thread with a real conversation that's gone quiet for 14+ days,
/// auto-moved out of [MessagingApi.fetchMyMatches] to declutter the main
/// inbox - still a live match, not deleted; sending a new message moves it
/// back on its own. See MessagingApi.fetchInactiveThreads.
class InactiveThread {
  InactiveThread({
    required this.matchId,
    required this.otherUserId,
    this.otherUserName,
    this.otherUserPhotoUrl,
    required this.lastMessageAt,
  });

  final String matchId;
  final String otherUserId;
  final String? otherUserName;
  final String? otherUserPhotoUrl;
  final DateTime lastMessageAt;
}

class ReconnectableMatch {
  ReconnectableMatch({
    required this.dissolvedMatchId,
    required this.otherUserId,
    this.otherUserName,
    this.otherUserPhotoUrl,
    required this.dissolvedAt,
  });

  final String dissolvedMatchId;
  final String otherUserId;
  final String? otherUserName;
  final String? otherUserPhotoUrl;
  final DateTime dissolvedAt;
}

/// A la carte "Unmatch Protection": a dissolved match whose conversation
/// was archived (rather than deleted) because either side had the
/// protection power-up enabled - see MessagingApi.fetchArchivedThreads.
class ArchivedThread {
  ArchivedThread({
    required this.dissolvedMatchId,
    required this.otherUserId,
    this.otherUserName,
    this.otherUserPhotoUrl,
    required this.dissolvedAt,
    required this.messageCount,
  });

  final String dissolvedMatchId;
  final String otherUserId;
  final String? otherUserName;
  final String? otherUserPhotoUrl;
  final DateTime dissolvedAt;
  final int messageCount;
}

class ArchivedChatMessage {
  ArchivedChatMessage({
    required this.id,
    required this.senderId,
    required this.contentType,
    this.content,
    this.mediaUrl,
    required this.createdAt,
  });

  final String id;
  final String senderId;
  final String contentType;
  final String? content;
  final String? mediaUrl;
  final DateTime createdAt;
}

class ChatMessage {
  ChatMessage({
    required this.id,
    required this.senderId,
    required this.contentType,
    this.content,
    this.mediaUrl,
    required this.isBlurred,
    this.moderationFlagged = false,
    this.moderationCategories = const [],
    this.durationSeconds,
    this.voiceEffectId,
    this.backgroundSoundId,
    this.transcript,
    this.readAt,
    this.icebreaker,
    this.poll,
    this.reservation,
    this.gift,
    this.expiryMode,
    this.viewTimerSeconds,
    this.isEphemeralExpired = false,
    required this.createdAt,
  });

  final String id;
  final String senderId;
  final String contentType;
  final String? content;
  final String? mediaUrl;
  final bool isBlurred;
  final bool moderationFlagged;
  final List<String> moderationCategories;
  final int? durationSeconds;
  final String? voiceEffectId;
  final String? backgroundSoundId;

  /// Auto-generated caption for a VOICE_NOTE message, for reading in
  /// noise-sensitive environments - null if transcription failed or this
  /// isn't a voice note.
  final String? transcript;
  final DateTime? readAt;
  final Icebreaker? icebreaker;
  final Poll? poll;
  final Reservation? reservation;
  final GiftCard? gift;

  /// 'VIEW_ONCE' or 'TIMER' for an auto-expiring photo/GIF; null for a
  /// normal, permanent message.
  final String? expiryMode;
  final int? viewTimerSeconds;
  final bool isEphemeralExpired;
  final DateTime createdAt;

  bool get isRead => readAt != null;
  bool get isEphemeral => expiryMode != null;
}

class Poll {
  Poll({
    required this.question,
    required this.options,
    this.myOptionIndex,
    required this.voteCounts,
    required this.totalVotes,
  });

  final String question;
  final List<String> options;
  final int? myOptionIndex;
  final List<int> voteCounts;
  final int totalVotes;

  bool get haveIVoted => myOptionIndex != null;
}

/// A deep-link to a third-party reservation/ticketing platform's search
/// results for whatever the sender typed - see
/// MessagingService.buildReservationUrl on the backend. Tapping [url] opens
/// that platform's site to finish booking; nothing is reserved in-app.
class Reservation {
  Reservation({required this.provider, required this.query, required this.url});

  final String provider;
  final String query;
  final String url;
}

/// A virtual gift sent directly into the chat as its own message - see
/// MessagingService.sendGiftMessage on the backend.
class GiftCard {
  GiftCard({required this.giftId, required this.name, required this.emoji, required this.tokenCost});

  final String giftId;
  final String name;
  final String emoji;
  final int tokenCost;
}

class VoiceNoteEffect {
  VoiceNoteEffect({required this.id, required this.label});

  final String id;
  final String label;
}

class VoiceNoteEffectsCatalog {
  VoiceNoteEffectsCatalog({required this.voiceEffects, required this.backgroundSounds});

  final List<VoiceNoteEffect> voiceEffects;
  final List<VoiceNoteEffect> backgroundSounds;
}

class IcebreakerPrompt {
  IcebreakerPrompt({
    required this.id,
    required this.question,
    required this.optionA,
    required this.optionB,
  });

  final String id;
  final String question;
  final String optionA;
  final String optionB;
}

class Icebreaker {
  Icebreaker({
    required this.promptId,
    required this.question,
    required this.optionA,
    required this.optionB,
    this.myOptionIndex,
    this.otherOptionIndex,
  });

  final String promptId;
  final String question;
  final String optionA;
  final String optionB;
  final int? myOptionIndex;
  final int? otherOptionIndex;

  bool get haveIAnswered => myOptionIndex != null;
  bool get haveBothAnswered => myOptionIndex != null && otherOptionIndex != null;
}

class GifResult {
  GifResult({required this.id, required this.url, required this.previewUrl});

  final String id;
  final String url;
  final String previewUrl;
}

class ModerationResult {
  ModerationResult({required this.flagged, required this.categories});

  final bool flagged;
  final List<String> categories;
}

/// Talks to the backend's match/messaging endpoints. Requires a signed-in
/// user's access token.
class MessagingApi {
  MessagingApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<List<MatchSummary>> fetchMyMatches() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/matches'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw MessagingApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map((json) {
      return MatchSummary(
        matchId: json['matchId'] as String,
        otherUserId: json['otherUserId'] as String,
        otherUserName: json['otherUserName'] as String?,
        otherUserPhotoUrl: json['otherUserPhotoUrl'] as String?,
        expiresAt: json['expiresAt'] != null ? DateTime.parse(json['expiresAt'] as String) : null,
        firstMessageSent: json['firstMessageSent'] as bool,
        canExtend: json['canExtend'] as bool? ?? false,
        createdAt: DateTime.parse(json['createdAt'] as String),
        needsGhostingPrompt: json['needsGhostingPrompt'] as bool? ?? false,
      );
    }).toList();
  }

  Future<List<InactiveThread>> fetchInactiveThreads() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/matches/inactive'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw MessagingApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map((json) {
      return InactiveThread(
        matchId: json['matchId'] as String,
        otherUserId: json['otherUserId'] as String,
        otherUserName: json['otherUserName'] as String?,
        otherUserPhotoUrl: json['otherUserPhotoUrl'] as String?,
        lastMessageAt: DateTime.parse(json['lastMessageAt'] as String),
      );
    }).toList();
  }

  /// Ends an ongoing match - the "politely unmatch" option on a ghosting prompt.
  Future<void> unmatch(String matchId) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/matches/$matchId/unmatch'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw MessagingApiException(_errorMessage(_decode(response), response.statusCode));
    }
  }

  /// A private note only the current user can see - never shared with the
  /// match. Returns null content when nothing has been saved yet.
  Future<MatchNote> fetchMatchNote(String matchId) async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/matches/$matchId/note'),
      headers: _headers,
    );

    return _parseMatchNote(response);
  }

  /// Saving blank content clears the note.
  Future<MatchNote> setMatchNote(String matchId, String content) async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/matches/$matchId/note'),
      headers: _headers,
      body: jsonEncode({'content': content}),
    );

    return _parseMatchNote(response);
  }

  MatchNote _parseMatchNote(http.Response response) {
    final body = _decode(response);
    if (response.statusCode != 200) {
      throw MessagingApiException(_errorMessage(body, response.statusCode));
    }

    return MatchNote(
      content: body['content'] as String?,
      updatedAt: body['updatedAt'] != null ? DateTime.parse(body['updatedAt'] as String) : null,
    );
  }

  Future<MatchStatus> fetchMatchStatus(String matchId) async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/matches/$matchId'),
      headers: _headers,
    );

    return _parseMatchStatus(response);
  }

  /// Gives the match one extra 24 hours before it dissolves for never
  /// messaging. Usable only once per match, before it expires and before
  /// either side has sent the first message.
  Future<MatchStatus> extendMatchTimeLimit(String matchId) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/matches/$matchId/extend'),
      headers: _headers,
    );

    return _parseMatchStatus(response);
  }

  /// Asks an unverified match to complete real-time selfie verification.
  /// Throws [MessagingApiException] (400) if they're already verified or a
  /// request has already been made for this match.
  Future<MatchStatus> requestVerification(String matchId) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/matches/$matchId/request-verification'),
      headers: _headers,
    );

    return _parseMatchStatus(response);
  }

  /// Premium "reconnect": matches that expired unmessaged are dissolved so
  /// the two users become rediscoverable in the deck; this lists those
  /// dissolved traces so a premium user can explicitly revive one instead
  /// of hoping to organically re-swipe each other.
  Future<List<ReconnectableMatch>> fetchReconnectableMatches() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/matches/reconnectable'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw MessagingApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map((json) {
      return ReconnectableMatch(
        dissolvedMatchId: json['dissolvedMatchId'] as String,
        otherUserId: json['otherUserId'] as String,
        otherUserName: json['otherUserName'] as String?,
        otherUserPhotoUrl: json['otherUserPhotoUrl'] as String?,
        dissolvedAt: DateTime.parse(json['dissolvedAt'] as String),
      );
    }).toList();
  }

  /// Premium-only: revives a dissolved match with a fresh first-message
  /// window. Throws [MessagingApiException] (403) if the user isn't
  /// premium, or (400) if the two already have an active match.
  Future<MatchStatus> reconnectMatch(String dissolvedMatchId) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/matches/reconnect/$dissolvedMatchId'),
      headers: _headers,
    );

    return _parseMatchStatus(response);
  }

  /// A la carte "Unmatch Protection": lists dissolved matches whose
  /// conversation was archived rather than deleted.
  Future<List<ArchivedThread>> fetchArchivedThreads() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/matches/archived'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw MessagingApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map((json) {
      return ArchivedThread(
        dissolvedMatchId: json['dissolvedMatchId'] as String,
        otherUserId: json['otherUserId'] as String,
        otherUserName: json['otherUserName'] as String?,
        otherUserPhotoUrl: json['otherUserPhotoUrl'] as String?,
        dissolvedAt: DateTime.parse(json['dissolvedAt'] as String),
        messageCount: json['messageCount'] as int,
      );
    }).toList();
  }

  Future<List<ArchivedChatMessage>> fetchArchivedThreadMessages(String dissolvedMatchId) async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/matches/archived/$dissolvedMatchId/messages'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw MessagingApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map((json) {
      return ArchivedChatMessage(
        id: json['id'] as String,
        senderId: json['senderId'] as String,
        contentType: json['contentType'] as String,
        content: json['content'] as String?,
        mediaUrl: json['mediaUrl'] as String?,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
    }).toList();
  }

  MatchStatus _parseMatchStatus(http.Response response) {
    final body = _decode(response);
    if (response.statusCode != 200) {
      throw MessagingApiException(_errorMessage(body, response.statusCode));
    }

    return MatchStatus(
      matchId: body['matchId'] as String,
      expiresAt: body['expiresAt'] != null ? DateTime.parse(body['expiresAt'] as String) : null,
      isExpired: body['isExpired'] as bool,
      firstMessageSent: body['firstMessageSent'] as bool,
      canSendFirstMessage: body['canSendFirstMessage'] as bool,
      canExtend: body['canExtend'] as bool? ?? false,
      otherUserIsVerified: body['otherUserIsVerified'] as bool? ?? false,
      verificationRequested: body['verificationRequested'] as bool? ?? false,
      verificationRequestedByMe: body['verificationRequestedByMe'] as bool? ?? false,
      otherUserSnoozeStatusMessage: body['otherUserSnoozeStatusMessage'] as String?,
      otherUserLastActiveAt: body['otherUserLastActiveAt'] != null
          ? DateTime.parse(body['otherUserLastActiveAt'] as String)
          : null,
    );
  }

  Future<List<ChatMessage>> fetchMessages(String matchId) async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/matches/$matchId/messages'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw MessagingApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map(_toChatMessage).toList();
  }

  Future<ChatMessage> sendMessage({required String matchId, required String content}) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/matches/$matchId/messages'),
      headers: _headers,
      body: jsonEncode({'content': content}),
    );

    final body = _decode(response);
    if (response.statusCode != 201) {
      throw MessagingApiException(_errorMessage(body, response.statusCode));
    }

    return _toChatMessage(body);
  }

  /// [expiryMode] ('VIEW_ONCE' or 'TIMER') makes this an auto-expiring
  /// attachment; [viewTimerSeconds] is required for 'TIMER' and must be
  /// omitted otherwise. [durationSeconds] is required when [contentType] is
  /// 'VIDEO_REACTION' (max MAX_VIDEO_REACTION_SECONDS on the backend) and
  /// must be omitted otherwise.
  Future<ChatMessage> sendMediaMessage({
    required String matchId,
    required String contentType,
    required String mediaUrl,
    String? expiryMode,
    int? viewTimerSeconds,
    int? durationSeconds,
  }) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/matches/$matchId/media'),
      headers: _headers,
      body: jsonEncode({
        'contentType': contentType,
        'mediaUrl': mediaUrl,
        'expiryMode': ?expiryMode,
        'viewTimerSeconds': ?viewTimerSeconds,
        'durationSeconds': ?durationSeconds,
      }),
    );

    final body = _decode(response);
    if (response.statusCode != 201) {
      throw MessagingApiException(_errorMessage(body, response.statusCode));
    }

    return _toChatMessage(body);
  }

  /// Opens an auto-expiring photo/GIF: starts its countdown and is the only
  /// response that ever includes the real mediaUrl for a VIEW_ONCE message,
  /// or a TIMER message past its window - see [ChatMessage.isEphemeral].
  Future<ChatMessage> viewEphemeralMedia({required String matchId, required String messageId}) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/matches/$matchId/messages/$messageId/view'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw MessagingApiException(_errorMessage(body, response.statusCode));
    }

    return _toChatMessage(body);
  }

  Future<ChatMessage> sendVoiceNote({
    required String matchId,
    required String mediaUrl,
    required int durationSeconds,
    String? voiceEffectId,
    String? backgroundSoundId,
  }) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/matches/$matchId/voice-note'),
      headers: _headers,
      body: jsonEncode({
        'mediaUrl': mediaUrl,
        'durationSeconds': durationSeconds,
        if (voiceEffectId != null) 'voiceEffectId': voiceEffectId,
        if (backgroundSoundId != null) 'backgroundSoundId': backgroundSoundId,
      }),
    );

    final body = _decode(response);
    if (response.statusCode != 201) {
      throw MessagingApiException(_errorMessage(body, response.statusCode));
    }

    return _toChatMessage(body);
  }

  /// Fetches the curated list of playback-time voice modulation filters and
  /// ambient background sounds that can be attached to a voice note.
  Future<VoiceNoteEffectsCatalog> fetchVoiceNoteEffects() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/matches/voice-note-effects'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw MessagingApiException(_errorMessage(body, response.statusCode));
    }

    VoiceNoteEffect toEffect(Map<String, dynamic> json) {
      return VoiceNoteEffect(id: json['id'] as String, label: json['label'] as String);
    }

    return VoiceNoteEffectsCatalog(
      voiceEffects: (body['voiceEffects'] as List).cast<Map<String, dynamic>>().map(toEffect).toList(),
      backgroundSounds: (body['backgroundSounds'] as List).cast<Map<String, dynamic>>().map(toEffect).toList(),
    );
  }

  Future<ChatMessage> revealImage({required String matchId, required String messageId}) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/matches/$matchId/messages/$messageId/reveal'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw MessagingApiException(_errorMessage(body, response.statusCode));
    }

    return _toChatMessage(body);
  }

  Future<List<GifResult>> searchGifs(String query, {int? limit}) async {
    final params = <String, String>{'q': query};
    if (limit != null) {
      params['limit'] = limit.toString();
    }
    final response = await _client.get(
      Uri.parse('$_baseUrl/matches/gifs/search').replace(queryParameters: params),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw MessagingApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list
        .cast<Map<String, dynamic>>()
        .map(
          (json) => GifResult(
            id: json['id'] as String,
            url: json['url'] as String,
            previewUrl: json['previewUrl'] as String,
          ),
        )
        .toList();
  }

  /// Real-time pre-send check: call with a draft message so the UI can
  /// warn the user before they actually send something the AI moderator
  /// flags as potentially harassing or harmful.
  Future<ModerationResult> checkMessage(String text) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/matches/moderation/check'),
      headers: _headers,
      body: jsonEncode({'text': text}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw MessagingApiException(_errorMessage(body, response.statusCode));
    }

    return ModerationResult(
      flagged: body['flagged'] as bool,
      categories: (body['categories'] as List).cast<String>(),
    );
  }

  /// Privacy toggle: when disabled, this user's reads of other people's
  /// messages are never stamped, so senders never see a read receipt.
  Future<bool> setReadReceiptsEnabled(bool enabled) async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/matches/read-receipts'),
      headers: _headers,
      body: jsonEncode({'enabled': enabled}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw MessagingApiException(_errorMessage(body, response.statusCode));
    }

    return body['readReceiptsEnabled'] as bool;
  }

  /// Consent toggle: when disabled, images this user receives arrive
  /// already revealed instead of blurred-until-tapped.
  Future<bool> setMediaBlurPreference(bool enabled) async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/matches/media-blur-preference'),
      headers: _headers,
      body: jsonEncode({'enabled': enabled}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw MessagingApiException(_errorMessage(body, response.statusCode));
    }

    return body['autoBlurIncomingMedia'] as bool;
  }

  Future<bool> fetchMediaBlurPreference() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/matches/media-blur-preference'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw MessagingApiException(_errorMessage(body, response.statusCode));
    }

    return body['autoBlurIncomingMedia'] as bool;
  }

  /// Heartbeat to call while the app is in active use, so matches can see
  /// roughly how recently this user was active. Automatically withheld from
  /// a match whose chat has gone quiet for a week (see
  /// [MatchStatus.otherUserLastActiveAt]).
  Future<DateTime> recordActivity() async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/matches/activity-ping'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw MessagingApiException(_errorMessage(body, response.statusCode));
    }

    return DateTime.parse(body['lastActiveAt'] as String);
  }

  /// Fetches the static bank of two-option icebreaker cards either person
  /// can send in-chat to spark conversation before meeting.
  Future<List<IcebreakerPrompt>> fetchIcebreakerPrompts() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/matches/icebreaker-prompts'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw MessagingApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list
        .cast<Map<String, dynamic>>()
        .map(
          (json) => IcebreakerPrompt(
            id: json['id'] as String,
            question: json['question'] as String,
            optionA: json['optionA'] as String,
            optionB: json['optionB'] as String,
          ),
        )
        .toList();
  }

  /// A single curated icebreaker prompt to nudge a fresh match into playing,
  /// or null once the match has left its first-message window or either
  /// side has already sent one.
  Future<IcebreakerPrompt?> fetchSuggestedIcebreaker(String matchId) async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/matches/$matchId/suggested-icebreaker'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw MessagingApiException(_errorMessage(_decode(response), response.statusCode));
    }

    if (response.body.isEmpty || response.body == 'null') {
      return null;
    }

    final json = jsonDecode(response.body) as Map<String, dynamic>;
    return IcebreakerPrompt(
      id: json['id'] as String,
      question: json['question'] as String,
      optionA: json['optionA'] as String,
      optionB: json['optionB'] as String,
    );
  }

  /// AI-suggested opening lines for this match, based on shared interests,
  /// compatibility-questionnaire overlap, and - when available - the
  /// match's own profile prompt answers.
  Future<List<String>> fetchIcebreakerSuggestions(String matchId) async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/matches/$matchId/icebreaker-suggestions'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw MessagingApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<String>();
  }

  Future<ChatMessage> sendIcebreaker({required String matchId, required String promptId}) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/matches/$matchId/icebreaker'),
      headers: _headers,
      body: jsonEncode({'promptId': promptId}),
    );

    final body = _decode(response);
    if (response.statusCode != 201) {
      throw MessagingApiException(_errorMessage(body, response.statusCode));
    }

    return _toChatMessage(body);
  }

  Future<ChatMessage> respondToIcebreaker({
    required String matchId,
    required String messageId,
    required int optionIndex,
  }) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/matches/$matchId/messages/$messageId/icebreaker-response'),
      headers: _headers,
      body: jsonEncode({'optionIndex': optionIndex}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw MessagingApiException(_errorMessage(body, response.statusCode));
    }

    return _toChatMessage(body);
  }

  Future<ChatMessage> sendPoll({
    required String matchId,
    required String question,
    required List<String> options,
  }) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/matches/$matchId/poll'),
      headers: _headers,
      body: jsonEncode({'question': question, 'options': options}),
    );

    final body = _decode(response);
    if (response.statusCode != 201) {
      throw MessagingApiException(_errorMessage(body, response.statusCode));
    }

    return _toChatMessage(body);
  }

  Future<ChatMessage> respondToPoll({
    required String matchId,
    required String messageId,
    required int optionIndex,
  }) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/matches/$matchId/messages/$messageId/poll-response'),
      headers: _headers,
      body: jsonEncode({'optionIndex': optionIndex}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw MessagingApiException(_errorMessage(body, response.statusCode));
    }

    return _toChatMessage(body);
  }

  /// [provider] must be 'OPENTABLE' (restaurant reservations) or
  /// 'EVENTBRITE' (event tickets); [query] is the restaurant or event name
  /// to search for on that platform.
  Future<ChatMessage> sendReservation({
    required String matchId,
    required String provider,
    required String query,
  }) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/matches/$matchId/reservation'),
      headers: _headers,
      body: jsonEncode({'provider': provider, 'query': query}),
    );

    final body = _decode(response);
    if (response.statusCode != 201) {
      throw MessagingApiException(_errorMessage(body, response.statusCode));
    }

    return _toChatMessage(body);
  }

  /// Sends a virtual gift directly into the chat (spending gift tokens the
  /// same way GiftingApi.sendGift does) so it shows up as its own message
  /// bubble instead of only on the recipient's received-gifts list.
  Future<ChatMessage> sendGiftMessage({
    required String matchId,
    required String giftId,
    String? message,
  }) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/matches/$matchId/gift'),
      headers: _headers,
      body: jsonEncode({'giftId': giftId, 'message': ?message}),
    );

    final body = _decode(response);
    if (response.statusCode != 201) {
      throw MessagingApiException(_errorMessage(body, response.statusCode));
    }

    return _toChatMessage(body);
  }

  Future<void> reportMessage({
    required String matchId,
    required String messageId,
    required String reason,
  }) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/matches/$matchId/messages/$messageId/report'),
      headers: _headers,
      body: jsonEncode({'reason': reason}),
    );

    if (response.statusCode != 201) {
      throw MessagingApiException(_errorMessage(_decode(response), response.statusCode));
    }
  }

  ChatMessage _toChatMessage(Map<String, dynamic> json) {
    final icebreakerJson = json['icebreaker'] as Map<String, dynamic>?;
    final pollJson = json['poll'] as Map<String, dynamic>?;
    final reservationJson = json['reservation'] as Map<String, dynamic>?;
    final giftJson = json['gift'] as Map<String, dynamic>?;
    return ChatMessage(
      id: json['id'] as String,
      senderId: json['senderId'] as String,
      contentType: json['contentType'] as String,
      content: json['content'] as String?,
      mediaUrl: json['mediaUrl'] as String?,
      isBlurred: json['isBlurred'] as bool,
      moderationFlagged: json['moderationFlagged'] as bool? ?? false,
      moderationCategories: (json['moderationCategories'] as List?)?.cast<String>() ?? const [],
      durationSeconds: json['durationSeconds'] as int?,
      voiceEffectId: json['voiceEffectId'] as String?,
      backgroundSoundId: json['backgroundSoundId'] as String?,
      transcript: json['transcript'] as String?,
      readAt: json['readAt'] != null ? DateTime.parse(json['readAt'] as String) : null,
      icebreaker: icebreakerJson != null
          ? Icebreaker(
              promptId: icebreakerJson['promptId'] as String,
              question: icebreakerJson['question'] as String,
              optionA: icebreakerJson['optionA'] as String,
              optionB: icebreakerJson['optionB'] as String,
              myOptionIndex: icebreakerJson['myOptionIndex'] as int?,
              otherOptionIndex: icebreakerJson['otherOptionIndex'] as int?,
            )
          : null,
      poll: pollJson != null
          ? Poll(
              question: pollJson['question'] as String,
              options: (pollJson['options'] as List).cast<String>(),
              myOptionIndex: pollJson['myOptionIndex'] as int?,
              voteCounts: (pollJson['voteCounts'] as List).cast<int>(),
              totalVotes: pollJson['totalVotes'] as int,
            )
          : null,
      reservation: reservationJson != null
          ? Reservation(
              provider: reservationJson['provider'] as String,
              query: reservationJson['query'] as String,
              url: reservationJson['url'] as String,
            )
          : null,
      gift: giftJson != null
          ? GiftCard(
              giftId: giftJson['giftId'] as String,
              name: giftJson['name'] as String,
              emoji: giftJson['emoji'] as String,
              tokenCost: giftJson['tokenCost'] as int,
            )
          : null,
      expiryMode: json['expiryMode'] as String?,
      viewTimerSeconds: json['viewTimerSeconds'] as int?,
      isEphemeralExpired: json['isEphemeralExpired'] as bool? ?? false,
      createdAt: DateTime.parse(json['createdAt'] as String),
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
