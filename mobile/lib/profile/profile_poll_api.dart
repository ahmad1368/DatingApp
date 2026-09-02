import 'dart:convert';

import 'package:http/http.dart' as http;

class ProfilePollApiException implements Exception {
  ProfilePollApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// A three-option (or more) poll embedded on a user's profile card -
/// prospective matches can vote with a single tap, before ever matching.
/// See ProfilePollApi.fetchPoll/vote.
class ProfilePoll {
  ProfilePoll({
    required this.question,
    required this.options,
    this.myOptionIndex,
    required this.voteCounts,
    required this.totalVotes,
  });

  /// Null when the profile has no active poll.
  final String? question;
  final List<String> options;
  /// The current viewer's own vote, or null if they haven't voted yet.
  final int? myOptionIndex;
  final List<int> voteCounts;
  final int totalVotes;

  bool get hasPoll => question != null && options.isNotEmpty;
}

class ProfilePollVoter {
  ProfilePollVoter({
    required this.voterId,
    this.voterName,
    this.voterPhotoUrl,
    required this.optionIndex,
    required this.votedAt,
  });

  final String voterId;
  final String? voterName;
  final String? voterPhotoUrl;
  final int optionIndex;
  final DateTime votedAt;
}

/// Talks to the backend's profile-poll endpoints: setting/clearing your own
/// poll, viewing and voting on someone else's, and seeing who voted on
/// yours.
class ProfilePollApi {
  ProfilePollApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  /// Sets (or replaces) the caller's own profile poll. Replacing an
  /// existing poll resets any votes already cast on it.
  Future<ProfilePoll> setPoll({required String question, required List<String> options}) async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/profile/poll'),
      headers: _headers,
      body: jsonEncode({'question': question, 'options': options}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw ProfilePollApiException(_errorMessage(body, response.statusCode));
    }

    return _toPoll(body);
  }

  Future<void> clearPoll() async {
    final response = await _client.delete(
      Uri.parse('$_baseUrl/profile/poll'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw ProfilePollApiException(_errorMessage(_decode(response), response.statusCode));
    }
  }

  /// [targetUserId]'s poll, from the caller's perspective (myOptionIndex
  /// reflects whether the caller has already voted). An empty/no-poll
  /// result (question: null) is a normal response, not an error.
  Future<ProfilePoll> fetchPoll(String targetUserId) async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/profile/poll/$targetUserId'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw ProfilePollApiException(_errorMessage(body, response.statusCode));
    }

    return _toPoll(body);
  }

  Future<ProfilePoll> vote({required String targetUserId, required int optionIndex}) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/profile/poll/vote'),
      headers: _headers,
      body: jsonEncode({'targetUserId': targetUserId, 'optionIndex': optionIndex}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw ProfilePollApiException(_errorMessage(body, response.statusCode));
    }

    return _toPoll(body);
  }

  /// Who has voted on the caller's own poll and what they picked - so the
  /// caller can start a conversation with someone whose answer caught
  /// their eye.
  Future<List<ProfilePollVoter>> fetchVoters() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/profile/poll/voters'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw ProfilePollApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map((json) {
      return ProfilePollVoter(
        voterId: json['voterId'] as String,
        voterName: json['voterName'] as String?,
        voterPhotoUrl: json['voterPhotoUrl'] as String?,
        optionIndex: json['optionIndex'] as int,
        votedAt: DateTime.parse(json['votedAt'] as String),
      );
    }).toList();
  }

  ProfilePoll _toPoll(Map<String, dynamic> json) {
    return ProfilePoll(
      question: json['question'] as String?,
      options: (json['options'] as List).cast<String>(),
      myOptionIndex: json['myOptionIndex'] as int?,
      voteCounts: (json['voteCounts'] as List).cast<int>(),
      totalVotes: json['totalVotes'] as int,
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
