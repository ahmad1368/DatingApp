import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/personality/topic_quiz_api.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

void main() {
  group('TopicQuizApi.fetchQuestions', () {
    test('parses the question catalog', () async {
      final api = TopicQuizApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/topic-quiz/questions');
          return _jsonResponse(
            '[{"id":"climate-policy","category":"Political",'
            '"statement":"Government should take an active role in fighting climate change."}]',
            200,
          );
        }),
      );

      final questions = await api.fetchQuestions();

      expect(questions, hasLength(1));
      expect(questions.first.id, 'climate-policy');
      expect(questions.first.category, 'Political');
    });

    test('throws TopicQuizApiException on a non-200 response', () async {
      final api = TopicQuizApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => _jsonResponse('{"message":"boom"}', 500)),
      );

      expect(() => api.fetchQuestions(), throwsA(isA<TopicQuizApiException>()));
    });
  });

  group('TopicQuizApi.submitQuiz', () {
    test('sends the bearer token and the responses as a list', () async {
      final api = TopicQuizApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.method, 'POST');
          expect(request.url.path, '/topic-quiz/responses');
          expect(request.body, '{"responses":[{"questionId":"climate-policy","stance":"AGREE"}]}');
          return _jsonResponse('{"responses":{"climate-policy":"AGREE"},"completedAt":"2026-01-01T00:00:00.000Z"}', 200);
        }),
      );

      await api.submitQuiz([const MapEntry('climate-policy', 'AGREE')]);
    });

    test('throws TopicQuizApiException on a non-200 response', () async {
      final api = TopicQuizApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse('{"message":"The quiz must be answered in full."}', 400),
        ),
      );

      expect(
        () => api.submitQuiz([const MapEntry('climate-policy', 'AGREE')]),
        throwsA(isA<TopicQuizApiException>()),
      );
    });
  });

  group('TopicQuizApi.fetchAlignment', () {
    test('parses the alignment result with its items', () async {
      final api = TopicQuizApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/topic-quiz/alignment/user-2');
          return _jsonResponse(
            '{"alignmentPercentage":50,"sharedTopicCount":1,"items":[{"questionId":"climate-policy",'
            '"category":"Political","statement":"...","myStance":"AGREE","theirStance":"DISAGREE",'
            '"agreement":"DISAGREE"}]}',
            200,
          );
        }),
      );

      final result = await api.fetchAlignment('user-2');

      expect(result.alignmentPercentage, 50);
      expect(result.sharedTopicCount, 1);
      expect(result.items, hasLength(1));
      expect(result.items.first.agreement, 'DISAGREE');
    });

    test('parses a null alignment percentage when neither quiz is fully shared', () async {
      final api = TopicQuizApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async =>
              _jsonResponse('{"alignmentPercentage":null,"sharedTopicCount":0,"items":[]}', 200),
        ),
      );

      final result = await api.fetchAlignment('user-2');

      expect(result.alignmentPercentage, isNull);
      expect(result.items, isEmpty);
    });

    test('throws TopicQuizApiException on a non-200 response', () async {
      final api = TopicQuizApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => _jsonResponse('{"message":"User not found."}', 404)),
      );

      expect(() => api.fetchAlignment('user-2'), throwsA(isA<TopicQuizApiException>()));
    });
  });
}
