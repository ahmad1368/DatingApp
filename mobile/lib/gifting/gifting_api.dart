import 'dart:convert';

import 'package:http/http.dart' as http;

class GiftingApiException implements Exception {
  GiftingApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class VirtualGift {
  VirtualGift({
    required this.id,
    required this.name,
    required this.emoji,
    required this.tokenCost,
    required this.animated,
  });

  final String id;
  final String name;
  final String emoji;
  final int tokenCost;
  final bool animated;
}

class GiftTransaction {
  GiftTransaction({
    required this.id,
    required this.gift,
    this.message,
    required this.createdAt,
    required this.otherUserId,
    this.otherUserName,
    this.otherUserPhotoUrl,
  });

  final String id;
  final VirtualGift gift;
  final String? message;
  final DateTime createdAt;
  final String otherUserId;
  final String? otherUserName;
  final String? otherUserPhotoUrl;
}

/// Talks to the backend's virtual-gifting endpoints. Requires a signed-in
/// user's access token.
class GiftingApi {
  GiftingApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<List<VirtualGift>> fetchCatalog() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/gifting/catalog'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw GiftingApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map(_toVirtualGift).toList();
  }

  Future<int> fetchBalance() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/gifting/balance'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw GiftingApiException(_errorMessage(body, response.statusCode));
    }

    return body['tokenBalance'] as int;
  }

  Future<int> sendGift({
    required String recipientId,
    required String giftId,
    String? message,
  }) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/gifting/send'),
      headers: _headers,
      body: jsonEncode({
        'recipientId': recipientId,
        'giftId': giftId,
        'message': ?message,
      }),
    );

    final body = _decode(response);
    if (response.statusCode != 201) {
      throw GiftingApiException(_errorMessage(body, response.statusCode));
    }

    return body['tokenBalance'] as int;
  }

  Future<List<GiftTransaction>> fetchReceivedGifts() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/gifting/received'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw GiftingApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map(_toGiftTransaction).toList();
  }

  Future<List<GiftTransaction>> fetchSentGifts() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/gifting/sent'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw GiftingApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map(_toGiftTransaction).toList();
  }

  VirtualGift _toVirtualGift(Map<String, dynamic> json) {
    return VirtualGift(
      id: json['id'] as String,
      name: json['name'] as String,
      emoji: json['emoji'] as String,
      tokenCost: json['tokenCost'] as int,
      animated: json['animated'] as bool? ?? false,
    );
  }

  GiftTransaction _toGiftTransaction(Map<String, dynamic> json) {
    return GiftTransaction(
      id: json['id'] as String,
      gift: _toVirtualGift(json['gift'] as Map<String, dynamic>),
      message: json['message'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      otherUserId: json['otherUserId'] as String,
      otherUserName: json['otherUserName'] as String?,
      otherUserPhotoUrl: json['otherUserPhotoUrl'] as String?,
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
