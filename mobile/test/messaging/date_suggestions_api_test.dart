import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/messaging/date_suggestions_api.dart';

void main() {
  group('DateSuggestionsApi.fetchMeetupSuggestions', () {
    test('sends the bearer token and parses the suggestions', () async {
      final api = DateSuggestionsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.url.path, '/date-suggestions/match-1');
          return http.Response(
            '{"midpoint":{"latitude":41.0,"longitude":-73.0},"distanceKm":250.5,'
            '"suggestions":[{"id":"cafe","label":"Coffee Shop","searchQuery":"coffee shop",'
            '"description":"Low-pressure.","mapsSearchUrl":"https://www.google.com/maps/search/x"}]}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await api.fetchMeetupSuggestions('match-1');

      expect(result.distanceKm, 250.5);
      expect(result.suggestions, hasLength(1));
      expect(result.suggestions.first.label, 'Coffee Shop');
      expect(result.suggestions.first.mapsSearchUrl, 'https://www.google.com/maps/search/x');
    });

    test('throws DateSuggestionsApiException when a location is missing', () async {
      final api = DateSuggestionsApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"Location is not available for one or both users."}',
            400,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(
        () => api.fetchMeetupSuggestions('match-1'),
        throwsA(isA<DateSuggestionsApiException>()),
      );
    });
  });

  group('DateSuggestionsApi.pickVenueCategory', () {
    test('sends the category id and parses the pick result', () async {
      http.Request? capturedRequest;
      final api = DateSuggestionsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          capturedRequest = request;
          return http.Response(
            '{"categoryId":"cafe","isMutualPick":true}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await api.pickVenueCategory('match-1', 'cafe');

      expect(capturedRequest!.method, 'POST');
      expect(capturedRequest!.url.path, '/date-suggestions/match-1/pick');
      expect(capturedRequest!.body, '{"categoryId":"cafe"}');
      expect(result.categoryId, 'cafe');
      expect(result.isMutualPick, isTrue);
    });

    test('throws DateSuggestionsApiException for an unknown category', () async {
      final api = DateSuggestionsApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"Unknown venue category."}',
            400,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(
        () => api.pickVenueCategory('match-1', 'not-real'),
        throwsA(isA<DateSuggestionsApiException>()),
      );
    });
  });
}
