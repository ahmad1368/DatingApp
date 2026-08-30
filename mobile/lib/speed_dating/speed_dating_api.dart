import 'dart:convert';

import 'package:http/http.dart' as http;

class SpeedDatingApiException implements Exception {
  SpeedDatingApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// The scheduled weekly window Speed Dating rounds are open in - see the
/// backend's SpeedDatingService.getEventSchedule.
class SpeedDatingSchedule {
  SpeedDatingSchedule({
    required this.live,
    required this.dayOfWeek,
    required this.startHourUtc,
    required this.endHourUtc,
  });

  final bool live;
  final int dayOfWeek;
  final int startHourUtc;
  final int endHourUtc;
}

class SpeedDatingStatus {
  SpeedDatingStatus({
    required this.status,
    this.roundId,
    this.endsAt,
    required this.myDecision,
    required this.otherDecided,
    required this.matched,
  });

  final String status;
  final String? roundId;
  final DateTime? endsAt;
  final bool? myDecision;
  final bool otherDecided;
  final bool matched;

  bool get isWaiting => status == 'WAITING';
  bool get isInRound => status == 'IN_ROUND';
  bool get isEnded => status == 'ENDED';
}

/// Talks to the backend's Speed Dating endpoints: a scheduled weekly event
/// that anonymously pairs the caller with a stranger for a single timed
/// round, after which both sides decide whether to match. There is no
/// mobile-side live audio/video wiring yet - see the backend's `calling`
/// module, which has the same "signaling only, no client media engine yet"
/// boundary - so this client covers the round lifecycle (queue, timer,
/// decision, reveal-via-match) rather than the WebRTC offer/answer/ICE
/// exchange itself.
class SpeedDatingApi {
  SpeedDatingApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<SpeedDatingSchedule> fetchSchedule() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/speed-dating/schedule'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw SpeedDatingApiException(_errorMessage(body, response.statusCode));
    }

    return SpeedDatingSchedule(
      live: body['live'] as bool,
      dayOfWeek: body['dayOfWeek'] as int,
      startHourUtc: body['startHourUtc'] as int,
      endHourUtc: body['endHourUtc'] as int,
    );
  }

  Future<SpeedDatingStatus> fetchStatus() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/speed-dating/status'),
      headers: _headers,
    );

    return _parseStatus(response);
  }

  Future<SpeedDatingStatus> joinQueue() async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/speed-dating/queue/join'),
      headers: _headers,
    );

    return _parseStatus(response);
  }

  Future<void> leaveQueue() async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/speed-dating/queue/leave'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw SpeedDatingApiException(_errorMessage(_decode(response), response.statusCode));
    }
  }

  Future<SpeedDatingStatus> decideRound({required String roundId, required bool wantsMatch}) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/speed-dating/rounds/$roundId/decision'),
      headers: _headers,
      body: jsonEncode({'wantsMatch': wantsMatch}),
    );

    return _parseStatus(response);
  }

  SpeedDatingStatus _parseStatus(http.Response response) {
    final body = _decode(response);
    if (response.statusCode != 200) {
      throw SpeedDatingApiException(_errorMessage(body, response.statusCode));
    }

    return SpeedDatingStatus(
      status: body['status'] as String,
      roundId: body['roundId'] as String?,
      endsAt: body['endsAt'] != null ? DateTime.parse(body['endsAt'] as String) : null,
      myDecision: body['myDecision'] as bool?,
      otherDecided: body['otherDecided'] as bool,
      matched: body['matched'] as bool,
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
