import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/profile/profile_prompts_api.dart';

void main() {
  group('ProfilePromptsApi.fetchCatalog', () {
    test('parses the list of catalog questions (no auth required)', () async {
      final api = ProfilePromptsApi(
        client: MockClient((request) async {
          expect(request.url.path, '/profile/prompts/catalog');
          expect(request.headers.containsKey('Authorization'), isFalse);
          return http.Response(
            '{"questions":["Q1","Q2"]}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final catalog = await api.fetchCatalog();

      expect(catalog, ['Q1', 'Q2']);
    });
  });

  group('ProfilePromptsApi.savePrompts', () {
    test('sends the bearer token and prompt list, and parses the result', () async {
      final api = ProfilePromptsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'PUT');
          expect(request.url.path, '/profile/prompts');
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(
            request.body,
            '{"prompts":[{"question":"Q1","answer":"A1"},{"question":"Q2","answer":"A2"}]}',
          );
          return http.Response(
            '[{"question":"Q1","answer":"A1","position":0},{"question":"Q2","answer":"A2","position":1}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await api.savePrompts([
        ProfilePromptEntry(question: 'Q1', answer: 'A1'),
        ProfilePromptEntry(question: 'Q2', answer: 'A2'),
      ]);

      expect(result, hasLength(2));
      expect(result.first.question, 'Q1');
    });

    test('throws ProfilePromptsApiException on a non-200 response', () async {
      final api = ProfilePromptsApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"Each prompt question can only be used once."}',
            400,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(
        () => api.savePrompts([ProfilePromptEntry(question: 'Q1', answer: 'A1')]),
        throwsA(isA<ProfilePromptsApiException>()),
      );
    });
  });
}
