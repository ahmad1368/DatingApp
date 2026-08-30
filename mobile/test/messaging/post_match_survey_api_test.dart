import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/messaging/post_match_survey_api.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

void main() {
  group('PostMatchSurveyApi.fetchMySurvey', () {
    test('sends the bearer token and parses an existing survey', () async {
      final api = PostMatchSurveyApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.method, 'GET');
          expect(request.url.path, '/post-match-survey/match-1');
          return _jsonResponse(
            '{"matchId":"match-1","metInPerson":true,"matchQuality":"GREAT",'
            '"createdAt":"2026-01-01T00:00:00.000Z"}',
            200,
          );
        }),
      );

      final survey = await api.fetchMySurvey('match-1');

      expect(survey, isNotNull);
      expect(survey!.metInPerson, isTrue);
      expect(survey.matchQuality, 'GREAT');
    });

    test('returns null when nothing has been submitted yet', () async {
      final api = PostMatchSurveyApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => _jsonResponse('null', 200)),
      );

      final survey = await api.fetchMySurvey('match-1');

      expect(survey, isNull);
    });

    test('throws PostMatchSurveyApiException on a non-200 response', () async {
      final api = PostMatchSurveyApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse('{"message":"Match not found."}', 404),
        ),
      );

      expect(() => api.fetchMySurvey('match-1'), throwsA(isA<PostMatchSurveyApiException>()));
    });
  });

  group('PostMatchSurveyApi.submitSurvey', () {
    test('sends metInPerson and matchQuality together', () async {
      final api = PostMatchSurveyApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'PUT');
          expect(request.url.path, '/post-match-survey/match-1');
          expect(request.body, '{"metInPerson":true,"matchQuality":"GOOD"}');
          return _jsonResponse(
            '{"matchId":"match-1","metInPerson":true,"matchQuality":"GOOD",'
            '"createdAt":"2026-01-01T00:00:00.000Z"}',
            200,
          );
        }),
      );

      final survey = await api.submitSurvey(
        matchId: 'match-1',
        metInPerson: true,
        matchQuality: 'GOOD',
      );

      expect(survey.matchQuality, 'GOOD');
    });

    test('omits matchQuality when not provided', () async {
      final api = PostMatchSurveyApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.body, '{"metInPerson":false}');
          return _jsonResponse(
            '{"matchId":"match-1","metInPerson":false,"matchQuality":null,'
            '"createdAt":"2026-01-01T00:00:00.000Z"}',
            200,
          );
        }),
      );

      await api.submitSurvey(matchId: 'match-1', metInPerson: false);
    });

    test('throws PostMatchSurveyApiException on a non-200 response', () async {
      final api = PostMatchSurveyApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async =>
              _jsonResponse('{"message":"matchQuality is required when you met in person."}', 400),
        ),
      );

      expect(
        () => api.submitSurvey(matchId: 'match-1', metInPerson: true),
        throwsA(isA<PostMatchSurveyApiException>()),
      );
    });
  });

  group('PostMatchSurveyApi.fetchDuePrompts', () {
    test('sends the bearer token and parses the due prompts', () async {
      final api = PostMatchSurveyApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.method, 'GET');
          expect(request.url.path, '/post-match-survey');
          return _jsonResponse(
            '[{"matchId":"match-1","reason":"PHONE_NUMBER_EXCHANGE",'
            '"otherUserId":"user-2","otherUserName":"Alex"}]',
            200,
          );
        }),
      );

      final prompts = await api.fetchDuePrompts();

      expect(prompts, hasLength(1));
      expect(prompts.first.matchId, 'match-1');
      expect(prompts.first.reason, 'PHONE_NUMBER_EXCHANGE');
      expect(prompts.first.otherUserName, 'Alex');
    });

    test('throws PostMatchSurveyApiException on a non-200 response', () async {
      final api = PostMatchSurveyApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => _jsonResponse('{"message":"boom"}', 500)),
      );

      expect(() => api.fetchDuePrompts(), throwsA(isA<PostMatchSurveyApiException>()));
    });
  });
}
