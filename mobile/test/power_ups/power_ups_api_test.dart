import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/power_ups/power_ups_api.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

const _catalogResponse =
    '[{"id":"boost","label":"Profile Boost (30 min)","coinCost":100}]';

void main() {
  group('PowerUpsApi.fetchCatalog', () {
    test('sends the bearer token and parses the catalog', () async {
      final api = PowerUpsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/power-ups/catalog');
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          return _jsonResponse(_catalogResponse, 200);
        }),
      );

      final catalog = await api.fetchCatalog();

      expect(catalog, hasLength(1));
      expect(catalog.first.id, 'boost');
      expect(catalog.first.coinCost, 100);
    });

    test('throws PowerUpsApiException on a non-200 response', () async {
      final api = PowerUpsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchCatalog(), throwsA(isA<PowerUpsApiException>()));
    });
  });

  group('PowerUpsApi.purchasePowerUp', () {
    test('sends the power-up id and returns the new coin balance', () async {
      final api = PowerUpsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/power-ups/purchase');
          expect(request.body, '{"powerUpId":"boost"}');
          return _jsonResponse('{"coinBalance":100,"powerUpId":"boost"}', 201);
        }),
      );

      expect(await api.purchasePowerUp('boost'), 100);
    });

    test('includes matchId when purchasing a match-timer extension', () async {
      final api = PowerUpsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.body, '{"powerUpId":"extend-match-timer","matchId":"match-1"}');
          return _jsonResponse('{"coinBalance":60,"powerUpId":"extend-match-timer"}', 201);
        }),
      );

      expect(await api.purchasePowerUp('extend-match-timer', matchId: 'match-1'), 60);
    });

    test('throws PowerUpsApiException when the coin balance is too low', () async {
      final api = PowerUpsApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse('{"message":"Not enough coins for this power-up."}', 400),
        ),
      );

      expect(() => api.purchasePowerUp('boost'), throwsA(isA<PowerUpsApiException>()));
    });
  });
}
