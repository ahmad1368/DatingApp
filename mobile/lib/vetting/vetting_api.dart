import 'dart:convert';

import 'package:http/http.dart' as http;

class VettingApiException implements Exception {
  VettingApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class VettingApplication {
  VettingApplication({
    required this.id,
    required this.userId,
    required this.status,
    required this.referralCount,
    required this.socialLinks,
    required this.decisionReason,
    required this.createdAt,
    required this.decidedAt,
  });

  final String id;
  final String userId;
  final String status;
  final int referralCount;
  final List<String> socialLinks;
  final String? decisionReason;
  final DateTime createdAt;
  final DateTime? decidedAt;

  bool get isPending => status == 'PENDING';
  bool get isApproved => status == 'APPROVED';
}

class QueuedApplication {
  QueuedApplication({
    required this.id,
    required this.referralCount,
    required this.socialLinks,
    required this.createdAt,
  });

  final String id;
  final int referralCount;
  final List<String> socialLinks;
  final DateTime createdAt;
}

/// Talks to the backend's member vetting endpoints: an applicant submits
/// social links and collects peer referrals from existing members before a
/// committee member can approve or reject them - see VettingService on the
/// backend for the full multi-stage protocol.
class VettingApi {
  VettingApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<VettingApplication> apply(List<String> socialLinks) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/vetting/apply'),
      headers: _headers,
      body: jsonEncode({'socialLinks': socialLinks}),
    );

    final body = _decode(response);
    if (response.statusCode != 201) {
      throw VettingApiException(_errorMessage(body, response.statusCode));
    }

    return _toApplication(body);
  }

  Future<VettingApplication?> fetchMyApplication() async {
    final response = await _client.get(Uri.parse('$_baseUrl/vetting/me'), headers: _headers);

    if (response.statusCode == 404) {
      return null;
    }
    final body = _decode(response);
    if (response.statusCode != 200) {
      throw VettingApiException(_errorMessage(body, response.statusCode));
    }

    return _toApplication(body);
  }

  /// A member who already knows the applicant's user id refers them directly.
  Future<VettingApplication> refer(String applicantUserId) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/vetting/referrals'),
      headers: _headers,
      body: jsonEncode({'applicantUserId': applicantUserId}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw VettingApiException(_errorMessage(body, response.statusCode));
    }

    return _toApplication(body);
  }

  /// The applicant-initiated counterpart to [refer]: redeems a code an
  /// existing member shared with them instead of the member looking up the
  /// applicant's user id themselves.
  Future<VettingApplication> redeemReferralCode(String code) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/vetting/referral-code/redeem'),
      headers: _headers,
      body: jsonEncode({'code': code}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw VettingApiException(_errorMessage(body, response.statusCode));
    }

    return _toApplication(body);
  }

  /// The caller's shareable referral code - only approved members have one.
  Future<String> fetchMyReferralCode() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/vetting/referral-code'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw VettingApiException(_errorMessage(body, response.statusCode));
    }

    return body['referralCode'] as String;
  }

  /// Committee-only: pending applications ranked by peer referral count.
  Future<List<QueuedApplication>> fetchQueue() async {
    final response = await _client.get(Uri.parse('$_baseUrl/vetting/queue'), headers: _headers);

    if (response.statusCode != 200) {
      throw VettingApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map((json) {
      return QueuedApplication(
        id: json['id'] as String,
        referralCount: json['referralCount'] as int,
        socialLinks: (json['socialLinks'] as List).cast<String>(),
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
    }).toList();
  }

  /// Committee-only: approves or rejects a pending application.
  Future<VettingApplication> decide({
    required String applicationId,
    required String decision,
    String? reason,
  }) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/vetting/applications/$applicationId/decide'),
      headers: _headers,
      body: jsonEncode({'decision': decision, if (reason != null) 'reason': reason}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw VettingApiException(_errorMessage(body, response.statusCode));
    }

    return _toApplication(body);
  }

  VettingApplication _toApplication(Map<String, dynamic> json) {
    return VettingApplication(
      id: json['id'] as String,
      userId: json['userId'] as String,
      status: json['status'] as String,
      referralCount: json['referralCount'] as int,
      socialLinks: (json['socialLinks'] as List).cast<String>(),
      decisionReason: json['decisionReason'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      decidedAt: json['decidedAt'] != null ? DateTime.parse(json['decidedAt'] as String) : null,
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
