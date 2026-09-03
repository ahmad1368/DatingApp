import 'dart:convert';

import 'package:http/http.dart' as http;

class SubscriptionsApiException implements Exception {
  SubscriptionsApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class SubscriptionPlan {
  SubscriptionPlan({
    required this.tier,
    required this.label,
    required this.priceUsdPerMonth,
    required this.features,
  });

  final String tier;
  final String label;
  final double priceUsdPerMonth;
  final List<String> features;
}

class SubscriptionStatus {
  SubscriptionStatus({
    required this.tier,
    required this.isActive,
    this.expiresAt,
    this.canceledAt,
  });

  final String tier;
  final bool isActive;
  final DateTime? expiresAt;
  final DateTime? canceledAt;
}

class SubscriptionVoucher {
  SubscriptionVoucher({
    required this.code,
    required this.tier,
    required this.createdAt,
    this.redeemedAt,
    this.redeemedByUserId,
  });

  final String code;
  final String tier;
  final DateTime createdAt;
  final DateTime? redeemedAt;
  final String? redeemedByUserId;

  bool get isRedeemed => redeemedAt != null;
}

class SubscriptionGift {
  SubscriptionGift({
    required this.id,
    required this.tier,
    required this.createdAt,
    required this.otherUserId,
    this.otherUserName,
    this.otherUserPhotoUrl,
  });

  final String id;
  final String tier;
  final DateTime createdAt;
  final String otherUserId;
  final String? otherUserName;
  final String? otherUserPhotoUrl;
}

/// Talks to the backend's subscription tier management endpoints. Requires
/// a signed-in user's access token.
class SubscriptionsApi {
  SubscriptionsApi({
    required this.accessToken,
    http.Client? client,
    String? baseUrl,
  }) : _client = client ?? http.Client(),
       _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer $accessToken',
  };

  Future<List<SubscriptionPlan>> fetchCatalog() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/subscriptions/catalog'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw SubscriptionsApiException(
        _errorMessage(_decode(response), response.statusCode),
      );
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map(_toPlan).toList();
  }

  Future<SubscriptionStatus> fetchStatus() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/subscriptions/status'),
      headers: _headers,
    );

    return _parseStatus(response);
  }

  Future<SubscriptionStatus> subscribe(String tier) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/subscriptions/subscribe'),
      headers: _headers,
      body: jsonEncode({'tier': tier}),
    );

    return _parseStatus(response);
  }

  Future<SubscriptionStatus> cancel() async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/subscriptions/cancel'),
      headers: _headers,
    );

    return _parseStatus(response);
  }

  /// Gifts a paid tier directly to another active member - grants them a
  /// fresh billing period, no payment step (see SubscriptionsService).
  Future<SubscriptionStatus> giftSubscription({
    required String recipientId,
    required String tier,
  }) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/subscriptions/gift'),
      headers: _headers,
      body: jsonEncode({'recipientId': recipientId, 'tier': tier}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw SubscriptionsApiException(_errorMessage(body, response.statusCode));
    }

    final recipientStatus = body['recipientStatus'] as Map<String, dynamic>;
    return SubscriptionStatus(
      tier: recipientStatus['tier'] as String,
      isActive: recipientStatus['isActive'] as bool,
      expiresAt: recipientStatus['expiresAt'] != null
          ? DateTime.parse(recipientStatus['expiresAt'] as String)
          : null,
      canceledAt: recipientStatus['canceledAt'] != null
          ? DateTime.parse(recipientStatus['canceledAt'] as String)
          : null,
    );
  }

  Future<List<SubscriptionGift>> fetchReceivedGifts() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/subscriptions/gifts/received'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw SubscriptionsApiException(
        _errorMessage(_decode(response), response.statusCode),
      );
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map(_toGift).toList();
  }

  /// Purchases a standalone voucher code for [tier] - not tied to a
  /// recipient up front, so it can be shared with anyone and redeemed later
  /// via [redeemVoucher].
  Future<SubscriptionVoucher> purchaseVoucher(String tier) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/subscriptions/vouchers/purchase'),
      headers: _headers,
      body: jsonEncode({'tier': tier}),
    );

    if (response.statusCode != 201) {
      throw SubscriptionsApiException(
        _errorMessage(_decode(response), response.statusCode),
      );
    }

    return _toVoucher(_decode(response));
  }

  Future<List<SubscriptionVoucher>> fetchMyVouchers() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/subscriptions/vouchers/mine'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw SubscriptionsApiException(
        _errorMessage(_decode(response), response.statusCode),
      );
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map(_toVoucher).toList();
  }

  /// Redeems a voucher [code], granting the caller a fresh billing period of
  /// its tier.
  Future<SubscriptionStatus> redeemVoucher(String code) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/subscriptions/vouchers/redeem'),
      headers: _headers,
      body: jsonEncode({'code': code}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw SubscriptionsApiException(_errorMessage(body, response.statusCode));
    }

    final status = body['status'] as Map<String, dynamic>;
    return SubscriptionStatus(
      tier: status['tier'] as String,
      isActive: status['isActive'] as bool,
      expiresAt: status['expiresAt'] != null
          ? DateTime.parse(status['expiresAt'] as String)
          : null,
      canceledAt: status['canceledAt'] != null
          ? DateTime.parse(status['canceledAt'] as String)
          : null,
    );
  }

  SubscriptionVoucher _toVoucher(Map<String, dynamic> json) {
    return SubscriptionVoucher(
      code: json['code'] as String,
      tier: json['tier'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      redeemedAt: json['redeemedAt'] != null
          ? DateTime.parse(json['redeemedAt'] as String)
          : null,
      redeemedByUserId: json['redeemedByUserId'] as String?,
    );
  }

  SubscriptionGift _toGift(Map<String, dynamic> json) {
    return SubscriptionGift(
      id: json['id'] as String,
      tier: json['tier'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      otherUserId: json['otherUserId'] as String,
      otherUserName: json['otherUserName'] as String?,
      otherUserPhotoUrl: json['otherUserPhotoUrl'] as String?,
    );
  }

  SubscriptionStatus _parseStatus(http.Response response) {
    final body = _decode(response);
    if (response.statusCode != 200) {
      throw SubscriptionsApiException(_errorMessage(body, response.statusCode));
    }

    return SubscriptionStatus(
      tier: body['tier'] as String,
      isActive: body['isActive'] as bool,
      expiresAt: body['expiresAt'] != null
          ? DateTime.parse(body['expiresAt'] as String)
          : null,
      canceledAt: body['canceledAt'] != null
          ? DateTime.parse(body['canceledAt'] as String)
          : null,
    );
  }

  SubscriptionPlan _toPlan(Map<String, dynamic> json) {
    return SubscriptionPlan(
      tier: json['tier'] as String,
      label: json['label'] as String,
      priceUsdPerMonth: (json['priceUsdPerMonth'] as num).toDouble(),
      features: (json['features'] as List).cast<String>(),
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
