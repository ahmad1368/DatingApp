import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/matching/matching_api.dart';

void main() {
  group('MatchingApi.fetchQuestions', () {
    test('sends the bearer token and parses the questions', () async {
      final api = MatchingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.url.path, '/questionnaire/questions');
          return http.Response(
            '[{"id":"q1","text":"Do you want kids?","options":["Yes","No"]}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final questions = await api.fetchQuestions();

      expect(questions, hasLength(1));
      expect(questions.first.text, 'Do you want kids?');
      expect(questions.first.options, ['Yes', 'No']);
    });

    test('throws MatchingApiException on a non-200 response', () async {
      final api = MatchingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchQuestions(), throwsA(isA<MatchingApiException>()));
    });
  });

  group('MatchingApi.submitAnswer', () {
    test('sends the answer and importance, and parses the result', () async {
      final api = MatchingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/questionnaire/answers');
          expect(
            request.body,
            '{"questionId":"q1","answer":"Yes","acceptableAnswers":["Yes"],"importance":"MANDATORY"}',
          );
          return http.Response(
            '{"questionId":"q1","answer":"Yes","acceptableAnswers":["Yes"],"importance":"MANDATORY"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final answer = await api.submitAnswer(
        questionId: 'q1',
        answer: 'Yes',
        acceptableAnswers: ['Yes'],
        importance: 'MANDATORY',
      );

      expect(answer.importance, 'MANDATORY');
    });

    test('throws MatchingApiException when the answer is invalid', () async {
      final api = MatchingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"Answer must be one of the question options."}',
            400,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(
        () => api.submitAnswer(
          questionId: 'q1',
          answer: 'Maybe',
          acceptableAnswers: [],
          importance: 'IRRELEVANT',
        ),
        throwsA(isA<MatchingApiException>()),
      );
    });
  });

  group('MatchingApi.getCompatibility', () {
    test('parses the compatibility percentage and zodiac harmony', () async {
      final api = MatchingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/questionnaire/compatibility/user-2');
          return http.Response(
            '{"percentage":87,"sharedQuestionCount":3,"zodiacSign":"Leo",'
            '"otherZodiacSign":"Aries","zodiacHarmony":"Highly Compatible"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await api.getCompatibility('user-2');

      expect(result.percentage, 87);
      expect(result.sharedQuestionCount, 3);
      expect(result.zodiacHarmony, 'Highly Compatible');
    });

    test('parses a null percentage when there are no shared answers', () async {
      final api = MatchingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"percentage":null,"sharedQuestionCount":0,"zodiacSign":null,'
            '"otherZodiacSign":null,"zodiacHarmony":null}',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final result = await api.getCompatibility('user-2');

      expect(result.percentage, isNull);
    });
  });
}
