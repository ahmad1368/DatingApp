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

  group('PersonalityApi.fetchCompatibilityReport', () {
    test('sends the bearer token and parses the report sections', () async {
      final api = PersonalityApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.url.path, '/personality-test/compatibility/user-2/report');
          return _jsonResponse(
            '{"percentage":85,"sharedDimensionCount":2,"sections":[{"title":"Emotional Compatibility",'
            '"score":80,"insight":"Generally compatible, with some differences worth navigating.",'
            '"dimensions":[{"dimension":"Optimism","myScore":80,"theirScore":100,"similarity":80}]}]}',
            200,
          );
        }),
      );

      final result = await api.fetchCompatibilityReport('user-2');

      expect(result.percentage, 85);
      expect(result.sharedDimensionCount, 2);
      expect(result.sections, hasLength(1));
      expect(result.sections.first.title, 'Emotional Compatibility');
      expect(result.sections.first.score, 80);
      expect(result.sections.first.dimensions.first.dimension, 'Optimism');
    });

    test('parses an empty section list when there is no shared data', () async {
      final api = PersonalityApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse(
            '{"percentage":null,"sharedDimensionCount":0,"sections":[]}',
            200,
          ),
        ),
      );

      final result = await api.fetchCompatibilityReport('user-2');

      expect(result.percentage, isNull);
      expect(result.sections, isEmpty);
    });

    test('throws PersonalityApiException on a non-200 response', () async {
      final api = PersonalityApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse('{"message":"User not found."}', 404),
        ),
      );

      expect(
        () => api.fetchCompatibilityReport('user-2'),
        throwsA(isA<PersonalityApiException>()),
      );
    });
  });

  group('PersonalityApi.fetchCategoryWeights', () {
    test('sends the bearer token and parses the weights', () async {
      final api = PersonalityApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'GET');
          expect(request.url.path, '/personality-test/weights');
          return _jsonResponse(
            '{"Emotional Values":1,"Core Values":2,"Communication Style":1,"Social Habits":0}',
            200,
          );
        }),
      );

      final weights = await api.fetchCategoryWeights();

      expect(weights['Emotional Values'], 1.0);
      expect(weights['Core Values'], 2.0);
      expect(weights['Social Habits'], 0.0);
    });

    test('throws PersonalityApiException on a non-200 response', () async {
      final api = PersonalityApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => _jsonResponse('', 500)),
      );

      expect(() => api.fetchCategoryWeights(), throwsA(isA<PersonalityApiException>()));
    });
  });

  group('PersonalityApi.setCategoryWeights', () {
    test('sends the weights and parses the normalized result', () async {
      final api = PersonalityApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/personality-test/weights');
          expect(request.body, '{"weights":{"Core Values":2.0}}');
          return _jsonResponse(
            '{"Emotional Values":1,"Core Values":2,"Communication Style":1,"Social Habits":1}',
            200,
          );
        }),
      );

      final weights = await api.setCategoryWeights({'Core Values': 2});

      expect(weights['Core Values'], 2.0);
    });

    test('throws PersonalityApiException when a category is unknown', () async {
      final api = PersonalityApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async =>
              _jsonResponse('{"message":"Unknown compatibility category: Foo"}', 400),
        ),
      );

      expect(
        () => api.setCategoryWeights({'Foo': 1}),
        throwsA(isA<PersonalityApiException>()),
      );
    });
  });
}
