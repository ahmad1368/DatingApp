import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/match_analytics/match_analytics_api.dart';

void main() {
  group('MatchAnalyticsApi.fetchMatchInsights', () {
    test('sends the bearer token and parses the insights', () async {
      final api = MatchAnalyticsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'GET');
          expect(request.url.path, '/match-analytics/insights');
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          return http.Response(
            '{"totalLikesSent":10,"totalMatches":3,"likeAcceptanceRate":0.3,'
            '"averageMessageInitiationSeconds":180}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final insights = await api.fetchMatchInsights();

      expect(insights.totalLikesSent, 10);
      expect(insights.totalMatches, 3);
      expect(insights.likeAcceptanceRate, 0.3);
      expect(insights.averageMessageInitiationSeconds, 180);
    });

    test('parses null rates when the backend has not enough data yet', () async {
      final api = MatchAnalyticsApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"totalLikesSent":0,"totalMatches":0,"likeAcceptanceRate":null,'
            '"averageMessageInitiationSeconds":null}',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final insights = await api.fetchMatchInsights();

      expect(insights.likeAcceptanceRate, isNull);
      expect(insights.averageMessageInitiationSeconds, isNull);
    });

    test('throws MatchAnalyticsApiException on a non-200 response', () async {
      final api = MatchAnalyticsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('{"message":"nope"}', 401)),
      );

      expect(() => api.fetchMatchInsights(), throwsA(isA<MatchAnalyticsApiException>()));
    });
  });
}
