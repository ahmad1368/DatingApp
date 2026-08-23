import 'dart:convert';

import 'package:http/http.dart' as http;

class WalletApiException implements Exception {
  WalletApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class CoinPackage {
  CoinPackage({
    required this.id,
    required this.coinAmount,
    required this.priceUsdCents,
    required this.label,
  });

  final String id;
  final int coinAmount;
  final int priceUsdCents;
  final String label;
}

class CoinPurchase {
  CoinPurchase({required this.id, required this.coinPackage, required this.createdAt});

  final String id;
  final CoinPackage coinPackage;
  final DateTime createdAt;
}

/// Talks to the backend's coin-wallet endpoints: browsing coin packages,
/// checking the shared coin balance (also spent on gifts and live-stream
/// tips), buying more coins, and viewing purchase history.
class WalletApi {
  WalletApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<List<CoinPackage>> fetchCatalog() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/wallet/catalog'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw WalletApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map(_toCoinPackage).toList();
  }

  Future<int> fetchBalance() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/wallet/balance'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw WalletApiException(_errorMessage(body, response.statusCode));
    }

    return body['coinBalance'] as int;
  }

  Future<int> purchaseCoins(String packageId) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/wallet/purchase'),
      headers: _headers,
      body: jsonEncode({'packageId': packageId}),
    );

    final body = _decode(response);
    if (response.statusCode != 201) {
      throw WalletApiException(_errorMessage(body, response.statusCode));
    }

    return body['coinBalance'] as int;
  }

  Future<List<CoinPurchase>> fetchPurchases() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/wallet/purchases'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw WalletApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map(_toCoinPurchase).toList();
  }

  CoinPackage _toCoinPackage(Map<String, dynamic> json) {
    return CoinPackage(
      id: json['id'] as String,
      coinAmount: json['coinAmount'] as int,
      priceUsdCents: json['priceUsdCents'] as int,
      label: json['label'] as String,
    );
  }

  CoinPurchase _toCoinPurchase(Map<String, dynamic> json) {
    return CoinPurchase(
      id: json['id'] as String,
      coinPackage: _toCoinPackage(json['coinPackage'] as Map<String, dynamic>),
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
