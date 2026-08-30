import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/curated_profiles/curated_profiles_api.dart';

void main() {
  group('CuratedProfilesApi.fetchDailyPicks', () {
    test('sends the bearer token and parses the daily picks', () async {
      final api = CuratedProfilesApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/curated-profiles/daily');
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          return http.Response(
            '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
            '"compatibilityPercentage":92}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final picks = await api.fetchDailyPicks();

      expect(picks, hasLength(1));
      expect(picks.first.id, 'user-2');
      expect(picks.first.name, 'Jane');
      expect(picks.first.compatibilityPercentage, 92);
      expect(picks.first.isStandout, isFalse);
    });

    test('parses isStandout when the backend includes it', () async {
      final api = CuratedProfilesApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
            '"compatibilityPercentage":92,"isStandout":true}]',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final picks = await api.fetchDailyPicks();

      expect(picks.first.isStandout, isTrue);
    });

    test('parses isTopPick when the backend includes it', () async {
      final api = CuratedProfilesApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
            '"compatibilityPercentage":92,"isTopPick":true}]',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final picks = await api.fetchDailyPicks();

      expect(picks.first.isTopPick, isTrue);
    });

    test('throws CuratedProfilesApiException on a non-200 response', () async {
      final api = CuratedProfilesApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchDailyPicks(), throwsA(isA<CuratedProfilesApiException>()));
    });
  });

  group('CuratedProfilesApi.fetchNextRefreshAt', () {
    test('sends the bearer token and parses the next refresh time', () async {
      final api = CuratedProfilesApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/curated-profiles/refresh-countdown');
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          return http.Response(
            '{"nextRefreshAt":"2026-01-02T12:00:00.000Z"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final nextRefreshAt = await api.fetchNextRefreshAt();

      expect(nextRefreshAt, DateTime.parse('2026-01-02T12:00:00.000Z'));
    });

    test('throws CuratedProfilesApiException on a non-200 response', () async {
      final api = CuratedProfilesApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchNextRefreshAt(), throwsA(isA<CuratedProfilesApiException>()));
    });
  });
}
