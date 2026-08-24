import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/ads/ads_api.dart';

void main() {
  group('AdsApi.fetchAdFree', () {
    test('sends the bearer token and parses the flag', () async {
      final api = AdsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/ads/eligibility');
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          return http.Response('{"adFree":true}', 200, headers: {'content-type': 'application/json'});
        }),
      );

      final adFree = await api.fetchAdFree();

      expect(adFree, isTrue);
    });

    test('throws AdsApiException on a non-200 response', () async {
      final api = AdsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchAdFree(), throwsA(isA<AdsApiException>()));
    });
  });

  group('AdsApi.fetchNextAd', () {
    test('sends the slot index and parses the creative', () async {
      final api = AdsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/ads/next');
          expect(request.url.queryParameters['slotIndex'], '2');
          return http.Response(
            '{"id":"native-travel-app","type":"NATIVE","headline":"Plan your next date getaway",'
            '"body":"Find flights and stays.","imageUrl":"https://example.com/a.jpg",'
            '"ctaLabel":"Explore","ctaUrl":"https://example.com/a"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final ad = await api.fetchNextAd(slotIndex: 2);

      expect(ad, isNotNull);
      expect(ad!.id, 'native-travel-app');
      expect(ad.headline, 'Plan your next date getaway');
    });

    test('returns null when the caller is ad-free', () async {
      final api = AdsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('null', 200, headers: {'content-type': 'application/json'})),
      );

      final ad = await api.fetchNextAd();

      expect(ad, isNull);
    });

    test('throws AdsApiException on a non-200 response', () async {
      final api = AdsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchNextAd(), throwsA(isA<AdsApiException>()));
    });
  });
}
