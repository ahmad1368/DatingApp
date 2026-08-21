import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/subscriptions/subscriptions_api.dart';

void main() {
  group('SubscriptionsApi.fetchCatalog', () {
    test('parses the tier catalog', () async {
      final api = SubscriptionsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/subscriptions/catalog');
          return http.Response(
            '[{"tier":"FREE","label":"Free","priceUsdPerMonth":0,"features":["Standard swiping"]},'
            '{"tier":"PLUS","label":"Plus","priceUsdPerMonth":9.99,"features":["Unlimited likes"]}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final catalog = await api.fetchCatalog();

      expect(catalog, hasLength(2));
      expect(catalog[1].tier, 'PLUS');
      expect(catalog[1].priceUsdPerMonth, 9.99);
    });

    test('throws SubscriptionsApiException on a non-200 response', () async {
      final api = SubscriptionsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchCatalog(), throwsA(isA<SubscriptionsApiException>()));
    });
  });

  group('SubscriptionsApi.fetchStatus', () {
    test('sends the bearer token and parses the status', () async {
      final api = SubscriptionsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.url.path, '/subscriptions/status');
          return http.Response(
            '{"tier":"GOLD","isActive":true,"expiresAt":"2026-02-01T00:00:00.000Z","canceledAt":null}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final status = await api.fetchStatus();

      expect(status.tier, 'GOLD');
      expect(status.isActive, isTrue);
      expect(status.expiresAt, DateTime.parse('2026-02-01T00:00:00.000Z'));
    });
  });

  group('SubscriptionsApi.subscribe', () {
    test('sends the tier and parses the new status', () async {
      final api = SubscriptionsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/subscriptions/subscribe');
          expect(request.body, '{"tier":"PLATINUM"}');
          return http.Response(
            '{"tier":"PLATINUM","isActive":true,"expiresAt":"2026-02-01T00:00:00.000Z","canceledAt":null}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final status = await api.subscribe('PLATINUM');

      expect(status.tier, 'PLATINUM');
    });
  });

  group('SubscriptionsApi.cancel', () {
    test('sends a POST and parses the reverted status', () async {
      final api = SubscriptionsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/subscriptions/cancel');
          return http.Response(
            '{"tier":"FREE","isActive":false,"expiresAt":null,"canceledAt":"2026-01-01T00:00:00.000Z"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final status = await api.cancel();

      expect(status.tier, 'FREE');
      expect(status.isActive, isFalse);
    });

    test('throws SubscriptionsApiException when not subscribed', () async {
      final api = SubscriptionsApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"You are not subscribed to a paid tier."}',
            400,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(() => api.cancel(), throwsA(isA<SubscriptionsApiException>()));
    });
  });
}
