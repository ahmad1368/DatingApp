import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/personality/personality_api.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

void main() {
  group('PersonalityApi.fetchCompatibilityBreakdown', () {
    test('sends the bearer token and parses a grouped breakdown', () async {
      final api = PersonalityApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.url.path, '/personality-test/compatibility/user-2/breakdown');
          return _jsonResponse(
            '{"percentage":90,"sharedDimensionCount":2,"categories":[{"category":"Emotional Values",'
            '"averageSimilarity":90,"dimensions":[{"dimension":"Optimism","myScore":80,'
            '"theirScore":100,"similarity":80},{"dimension":"Warmth","myScore":60,'
            '"theirScore":60,"similarity":100}]}]}',
            200,
          );
        }),
      );

      final result = await api.fetchCompatibilityBreakdown('user-2');

      expect(result.percentage, 90);
      expect(result.sharedDimensionCount, 2);
      expect(result.categories, hasLength(1));
      expect(result.categories.first.category, 'Emotional Values');
      expect(result.categories.first.dimensions, hasLength(2));
      expect(result.categories.first.dimensions.first.dimension, 'Optimism');
    });

    test('parses a null percentage when neither test is fully shared', () async {
      final api = PersonalityApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse(
            '{"percentage":null,"sharedDimensionCount":0,"categories":[]}',
            200,
          ),
        ),
      );

      final result = await api.fetchCompatibilityBreakdown('user-2');

      expect(result.percentage, isNull);
      expect(result.categories, isEmpty);
    });

    test('throws PersonalityApiException on a non-200 response', () async {
      final api = PersonalityApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse('{"message":"User not found."}', 404),
        ),
      );

      expect(
        () => api.fetchCompatibilityBreakdown('user-2'),
        throwsA(isA<PersonalityApiException>()),
      );
    });
  });
}
