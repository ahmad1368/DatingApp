import 'dart:convert';

import 'package:http/http.dart' as http;

class CouplesApiException implements Exception {
  CouplesApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// One confirmed, active link to another user - see backend's PartnerLink.
/// Only a link with [jointBrowsingEnabled] can be picked as the active
/// browsing partner (see CouplesApi.setActiveBrowsingPartner).
class PartnerLink {
  PartnerLink({
    required this.id,
    required this.partnerId,
    this.partnerName,
    required this.linkedAt,
    required this.jointBrowsingEnabled,
  });

  final String id;
  final String partnerId;
  final String? partnerName;
  final DateTime linkedAt;
  final bool jointBrowsingEnabled;
}

/// Talks to the backend's `/couples` endpoints for the "Couple & Group
/// Profile Browsing Switch": listing linked partners and switching the
/// caller's discovery deck between solo browsing and joint browsing with
/// one specific partner. Inviting/accepting/declining/unpairing links is
/// out of scope here - this is just the browsing-mode switch.
class CouplesApi {
  CouplesApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<List<PartnerLink>> fetchPartners() async {
    final response = await _client.get(Uri.parse('$_baseUrl/couples/partners'), headers: _headers);

    if (response.statusCode != 200) {
      throw CouplesApiException(_errorMessage(_decodeList(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list
        .cast<Map<String, dynamic>>()
        .map(
          (json) => PartnerLink(
            id: json['id'] as String,
            partnerId: json['partnerId'] as String,
            partnerName: json['partnerName'] as String?,
            linkedAt: DateTime.parse(json['linkedAt'] as String),
            jointBrowsingEnabled: json['jointBrowsingEnabled'] as bool,
          ),
        )
        .toList();
  }

  /// The partner the caller's deck is currently browsed jointly with, or
  /// null when browsing solo.
  Future<String?> fetchActiveBrowsingPartnerId() async {
    final response = await _client.get(Uri.parse('$_baseUrl/couples/active-browsing'), headers: _headers);

    final body = _decodeMap(response);
    if (response.statusCode != 200) {
      throw CouplesApiException(_errorMessage(body, response.statusCode));
    }

    return body['activeBrowsingPartnerId'] as String?;
  }

  /// Pass null to switch back to solo browsing.
  Future<String?> setActiveBrowsingPartner(String? partnerId) async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/couples/active-browsing'),
      headers: _headers,
      body: jsonEncode({'partnerId': ?partnerId}),
    );

    final body = _decodeMap(response);
    if (response.statusCode != 200) {
      throw CouplesApiException(_errorMessage(body, response.statusCode));
    }

    return body['activeBrowsingPartnerId'] as String?;
  }

  Map<String, dynamic> _decodeMap(http.Response response) {
    if (response.body.isEmpty) {
      return const {};
    }
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Map<String, dynamic> _decodeList(http.Response response) {
    if (response.body.isEmpty) {
      return const {};
    }
    final decoded = jsonDecode(response.body);
    return decoded is Map<String, dynamic> ? decoded : const {};
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
