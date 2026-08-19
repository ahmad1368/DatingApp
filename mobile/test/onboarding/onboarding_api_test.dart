import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/onboarding/onboarding_api.dart';

void main() {
  group('OnboardingApi.completeOnboarding', () {
    test('sends the bearer token and payload, and parses the result', () async {
      final api = OnboardingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'PUT');
          expect(request.url.path, '/onboarding');
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(
            request.body,
            '{"name":"Jane","dateOfBirth":"1995-05-01",'
            '"relationshipGoal":"CASUAL","interests":["Hiking","Music"]}',
          );
          return http.Response(
            '{"id":"user-1","name":"Jane","dateOfBirth":"1995-05-01T00:00:00.000Z",'
            '"relationshipGoal":"CASUAL","interests":["Hiking","Music"]}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await api.completeOnboarding(
        name: 'Jane',
        dateOfBirth: '1995-05-01',
        relationshipGoal: 'CASUAL',
        interests: const ['Hiking', 'Music'],
      );

      expect(result.id, 'user-1');
      expect(result.name, 'Jane');
      expect(result.interests, ['Hiking', 'Music']);
    });

    test('omits name from the request when not provided', () async {
      final api = OnboardingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(
            request.body,
            '{"dateOfBirth":"1990-01-01",'
            '"relationshipGoal":"FRIENDSHIP","interests":["Travel"]}',
          );
          return http.Response(
            '{"id":"user-2","name":null,"dateOfBirth":"1990-01-01T00:00:00.000Z",'
            '"relationshipGoal":"FRIENDSHIP","interests":["Travel"]}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      await api.completeOnboarding(
        dateOfBirth: '1990-01-01',
        relationshipGoal: 'FRIENDSHIP',
        interests: const ['Travel'],
      );
    });

    test('throws OnboardingApiException when the backend rejects the request', () async {
      final api = OnboardingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"You must be at least 18 years old to use this app."}',
            400,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(
        () => api.completeOnboarding(
          dateOfBirth: '2015-01-01',
          relationshipGoal: 'CASUAL',
          interests: const ['Music'],
        ),
        throwsA(isA<OnboardingApiException>()),
      );
    });
  });
}
