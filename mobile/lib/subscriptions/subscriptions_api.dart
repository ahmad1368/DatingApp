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

/// Talks to the backend's subscription tier management endpoints. Requires
/// a signed-in user's access token.
class SubscriptionsApi {
  SubscriptionsApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
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
      throw SubscriptionsApiException(_errorMessage(_decode(response), response.statusCode));
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

  SubscriptionStatus _parseStatus(http.Response response) {
    final body = _decode(response);
    if (response.statusCode != 200) {
      throw SubscriptionsApiException(_errorMessage(body, response.statusCode));
    }

    return SubscriptionStatus(
      tier: body['tier'] as String,
      isActive: body['isActive'] as bool,
      expiresAt: body['expiresAt'] != null ? DateTime.parse(body['expiresAt'] as String) : null,
      canceledAt: body['canceledAt'] != null ? DateTime.parse(body['canceledAt'] as String) : null,
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
