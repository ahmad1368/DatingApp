import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/profile/profile_prompts_api.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

void main() {
  group('ProfilePromptsApi.fetchPrompts', () {
    test('sends the bearer token and parses the catalog', () async {
      final api = ProfilePromptsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.url.path, '/profile-prompts/items');
          return _jsonResponse(
            '[{"id":"perfect-first-date","question":"My idea of a perfect first date is..."}]',
            200,
          );
        }),
      );

      final prompts = await api.fetchPrompts();

      expect(prompts, hasLength(1));
      expect(prompts.first.id, 'perfect-first-date');
    });

    test('throws ProfilePromptsApiException on a non-200 response', () async {
      final api = ProfilePromptsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchPrompts(), throwsA(isA<ProfilePromptsApiException>()));
    });
  });

  group('ProfilePromptsApi.fetchMyAnswers', () {
    test('parses stored answers', () async {
      final api = ProfilePromptsApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse(
            '[{"promptId":"perfect-first-date","question":"My idea of a perfect first date is...",'
            '"audioUrl":"file:///a.m4a","durationSeconds":12,"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
          ),
        ),
      );

      final answers = await api.fetchMyAnswers();

      expect(answers, hasLength(1));
      expect(answers.first.durationSeconds, 12);
    });
  });

  group('ProfilePromptsApi.recordAnswer', () {
    test('sends the prompt id, url, and duration', () async {
      final api = ProfilePromptsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/profile-prompts/answers');
          expect(
            request.body,
            '{"promptId":"perfect-first-date","audioUrl":"file:///a.m4a","durationSeconds":12}',
          );
          return _jsonResponse(
            '{"promptId":"perfect-first-date","question":"My idea of a perfect first date is...",'
            '"audioUrl":"file:///a.m4a","durationSeconds":12,"createdAt":"2026-01-01T00:00:00.000Z"}',
            200,
          );
        }),
      );

      final answer = await api.recordAnswer(
        promptId: 'perfect-first-date',
        audioUrl: 'file:///a.m4a',
        durationSeconds: 12,
      );

      expect(answer.promptId, 'perfect-first-date');
    });

    test('throws ProfilePromptsApiException for an unknown prompt', () async {
      final api = ProfilePromptsApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse('{"message":"Unknown profile prompt."}', 400),
        ),
      );

      expect(
        () => api.recordAnswer(promptId: 'nope', audioUrl: 'x', durationSeconds: 1),
        throwsA(isA<ProfilePromptsApiException>()),
      );
    });
  });

  group('ProfilePromptsApi.deleteAnswer', () {
    test('sends a DELETE to the prompt-specific path', () async {
      final api = ProfilePromptsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'DELETE');
          expect(request.url.path, '/profile-prompts/answers/perfect-first-date');
          return http.Response('', 200);
        }),
      );

      await api.deleteAnswer('perfect-first-date');
    });

    test('throws ProfilePromptsApiException when the answer does not exist', () async {
      final api = ProfilePromptsApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse('{"message":"Voice answer not found."}', 404),
        ),
      );

      expect(() => api.deleteAnswer('nope'), throwsA(isA<ProfilePromptsApiException>()));
    });
  });
}
