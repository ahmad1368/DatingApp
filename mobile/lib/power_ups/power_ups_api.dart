import 'dart:convert';

import 'package:http/http.dart' as http;

class PowerUpsApiException implements Exception {
  PowerUpsApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class PowerUp {
  PowerUp({required this.id, required this.label, required this.coinCost});

  final String id;
  final String label;
  final int coinCost;
}

/// Talks to the backend's power-up endpoints: one-time, coin-purchased
/// perks (a profile boost, an extra super like) that work without a
/// subscription, spent from the same shared coin balance as the wallet.
class PowerUpsApi {
  PowerUpsApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<List<PowerUp>> fetchCatalog() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/power-ups/catalog'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw PowerUpsApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map(_toPowerUp).toList();
  }

  Future<int> purchasePowerUp(String powerUpId) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/power-ups/purchase'),
      headers: _headers,
      body: jsonEncode({'powerUpId': powerUpId}),
    );

    final body = _decode(response);
    if (response.statusCode != 201) {
      throw PowerUpsApiException(_errorMessage(body, response.statusCode));
    }

    return body['coinBalance'] as int;
  }

  PowerUp _toPowerUp(Map<String, dynamic> json) {
    return PowerUp(
      id: json['id'] as String,
      label: json['label'] as String,
      coinCost: json['coinCost'] as int,
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
