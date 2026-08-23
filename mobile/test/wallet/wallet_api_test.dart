import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/wallet/wallet_api.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

const _catalogResponse =
    '[{"id":"starter","coinAmount":100,"priceUsdCents":199,"label":"100 coins"}]';

void main() {
  group('WalletApi.fetchCatalog', () {
    test('sends the bearer token and parses the catalog', () async {
      final api = WalletApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/wallet/catalog');
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          return _jsonResponse(_catalogResponse, 200);
        }),
      );

      final catalog = await api.fetchCatalog();

      expect(catalog, hasLength(1));
      expect(catalog.first.id, 'starter');
      expect(catalog.first.coinAmount, 100);
    });

    test('throws WalletApiException on a non-200 response', () async {
      final api = WalletApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchCatalog(), throwsA(isA<WalletApiException>()));
    });
  });

  group('WalletApi.fetchBalance', () {
    test('parses the coin balance', () async {
      final api = WalletApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => _jsonResponse('{"coinBalance":250}', 200)),
      );

      expect(await api.fetchBalance(), 250);
    });

    test('throws WalletApiException when the user is missing', () async {
      final api = WalletApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse('{"message":"User not found."}', 404),
        ),
      );

      expect(() => api.fetchBalance(), throwsA(isA<WalletApiException>()));
    });
  });

  group('WalletApi.purchaseCoins', () {
    test('sends the package id and returns the new balance', () async {
      final api = WalletApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/wallet/purchase');
          expect(request.body, '{"packageId":"starter"}');
          return _jsonResponse('{"coinBalance":200,"purchase":{}}', 201);
        }),
      );

      expect(await api.purchaseCoins('starter'), 200);
    });

    test('throws WalletApiException for an unknown package', () async {
      final api = WalletApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse('{"message":"Unknown coin package."}', 400),
        ),
      );

      expect(() => api.purchaseCoins('not-real'), throwsA(isA<WalletApiException>()));
    });
  });

  group('WalletApi.fetchPurchases', () {
    test('parses purchase history', () async {
      final api = WalletApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse(
            '[{"id":"purchase-1","coinPackage":{"id":"starter","coinAmount":100,'
            '"priceUsdCents":199,"label":"100 coins"},"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
          ),
        ),
      );

      final purchases = await api.fetchPurchases();

      expect(purchases, hasLength(1));
      expect(purchases.first.coinPackage.id, 'starter');
    });
  });
}
