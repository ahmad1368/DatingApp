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
      expect(answers.first.transcript, isNull);
    });

    test('parses a generated transcript when present', () async {
      final api = ProfilePromptsApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse(
            '[{"promptId":"perfect-first-date","question":"My idea of a perfect first date is...",'
            '"audioUrl":"file:///a.m4a","durationSeconds":12,"transcript":"A picnic in the park.",'
            '"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
          ),
        ),
      );

      final answers = await api.fetchMyAnswers();

      expect(answers.first.transcript, 'A picnic in the park.');
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

  group('ProfilePromptsApi.reactToVoicePrompt', () {
    test('sends a text comment reaction', () async {
      http.Request? postRequest;
      final api = ProfilePromptsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          postRequest = request;
          return _jsonResponse(
            '{"id":"reaction-1","fromUserId":"user-1","toUserId":"user-2",'
            '"promptId":"perfect-first-date","comment":"Love this!","audioReplyUrl":null,'
            '"durationSeconds":null,"createdAt":"2026-01-01T00:00:00.000Z"}',
            201,
          );
        }),
      );

      final reaction = await api.reactToVoicePrompt(
        promptId: 'perfect-first-date',
        targetUserId: 'user-2',
        comment: 'Love this!',
      );

      expect(postRequest!.method, 'POST');
      expect(postRequest!.url.path, '/profile-prompts/perfect-first-date/reactions');
      expect(postRequest!.body, '{"targetUserId":"user-2","comment":"Love this!"}');
      expect(reaction.comment, 'Love this!');
      expect(reaction.audioReplyUrl, isNull);
    });

    test('sends an audio reply reaction', () async {
      http.Request? postRequest;
      final api = ProfilePromptsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          postRequest = request;
          return _jsonResponse(
            '{"id":"reaction-2","fromUserId":"user-1","toUserId":"user-2",'
            '"promptId":"perfect-first-date","comment":null,'
            '"audioReplyUrl":"file:///tmp/reply.m4a","durationSeconds":8,'
            '"createdAt":"2026-01-01T00:00:00.000Z"}',
            201,
          );
        }),
      );

      final reaction = await api.reactToVoicePrompt(
        promptId: 'perfect-first-date',
        targetUserId: 'user-2',
        audioReplyUrl: 'file:///tmp/reply.m4a',
        durationSeconds: 8,
      );

      expect(
        postRequest!.body,
        '{"targetUserId":"user-2","audioReplyUrl":"file:///tmp/reply.m4a","durationSeconds":8}',
      );
      expect(reaction.audioReplyUrl, 'file:///tmp/reply.m4a');
      expect(reaction.durationSeconds, 8);
    });

    test('throws ProfilePromptsApiException when the target has no answer for that prompt', () async {
      final api = ProfilePromptsApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async =>
              _jsonResponse('{"message":"This user has no voice answer for that prompt."}', 404),
        ),
      );

      expect(
        () => api.reactToVoicePrompt(
          promptId: 'perfect-first-date',
          targetUserId: 'user-2',
          comment: 'Hi',
        ),
        throwsA(isA<ProfilePromptsApiException>()),
      );
    });
  });

  group('ProfilePromptsApi.fetchReactions', () {
    test('parses reactions received on the caller\'s own prompt answer', () async {
      final api = ProfilePromptsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/profile-prompts/perfect-first-date/reactions');
          return _jsonResponse(
            '[{"id":"reaction-1","fromUserId":"user-2","toUserId":"user-1",'
            '"promptId":"perfect-first-date","comment":"Love this!","audioReplyUrl":null,'
            '"durationSeconds":null,"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
          );
        }),
      );

      final reactions = await api.fetchReactions('perfect-first-date');

      expect(reactions, hasLength(1));
      expect(reactions.first.comment, 'Love this!');
    });

    test('throws ProfilePromptsApiException on a non-200 response', () async {
      final api = ProfilePromptsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchReactions('perfect-first-date'), throwsA(isA<ProfilePromptsApiException>()));
    });
  });

  group('ProfilePromptsApi.reactToPhoto', () {
    test('sends an audio reply reaction to a photo', () async {
      http.Request? postRequest;
      final api = ProfilePromptsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          postRequest = request;
          return _jsonResponse(
            '{"id":"reaction-3","fromUserId":"user-1","toUserId":"user-2",'
            '"promptId":null,"photoId":"photo-1","comment":null,'
            '"audioReplyUrl":"file:///tmp/reply.m4a","durationSeconds":6,'
            '"createdAt":"2026-01-01T00:00:00.000Z"}',
            201,
          );
        }),
      );

      final reaction = await api.reactToPhoto(
        photoId: 'photo-1',
        targetUserId: 'user-2',
        audioReplyUrl: 'file:///tmp/reply.m4a',
        durationSeconds: 6,
      );

      expect(postRequest!.method, 'POST');
      expect(postRequest!.url.path, '/profile-prompts/photos/photo-1/reactions');
      expect(
        postRequest!.body,
        '{"targetUserId":"user-2","audioReplyUrl":"file:///tmp/reply.m4a","durationSeconds":6}',
      );
      expect(reaction.photoId, 'photo-1');
      expect(reaction.promptId, isNull);
    });

    test('throws ProfilePromptsApiException when the target has no photo with that id', () async {
      final api = ProfilePromptsApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse('{"message":"This user has no photo with that id."}', 404),
        ),
      );

      expect(
        () => api.reactToPhoto(photoId: 'photo-1', targetUserId: 'user-2', comment: 'Hi'),
        throwsA(isA<ProfilePromptsApiException>()),
      );
    });
  });

  group('ProfilePromptsApi.fetchPhotoReactions', () {
    test("parses reactions received on the caller's own photo", () async {
      final api = ProfilePromptsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/profile-prompts/photos/photo-1/reactions');
          return _jsonResponse(
            '[{"id":"reaction-1","fromUserId":"user-2","toUserId":"user-1",'
            '"promptId":null,"photoId":"photo-1","comment":"Great shot!","audioReplyUrl":null,'
            '"durationSeconds":null,"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
          );
        }),
      );

      final reactions = await api.fetchPhotoReactions('photo-1');

      expect(reactions, hasLength(1));
      expect(reactions.first.comment, 'Great shot!');
    });

    test('throws ProfilePromptsApiException on a non-200 response', () async {
      final api = ProfilePromptsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchPhotoReactions('photo-1'), throwsA(isA<ProfilePromptsApiException>()));
    });
  });

  group('ProfilePromptsApi.fetchMyVideoAnswers', () {
    test('parses stored video answers', () async {
      final api = ProfilePromptsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/profile-prompts/video/me');
          return _jsonResponse(
            '[{"promptId":"perfect-first-date","question":"My idea of a perfect first date is...",'
            '"videoUrl":"file:///a.mp4","durationSeconds":10,"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
          );
        }),
      );

      final answers = await api.fetchMyVideoAnswers();

      expect(answers, hasLength(1));
      expect(answers.first.videoUrl, 'file:///a.mp4');
      expect(answers.first.durationSeconds, 10);
      expect(answers.first.transcript, isNull);
    });

    test('parses a generated transcript when present', () async {
      final api = ProfilePromptsApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse(
            '[{"promptId":"perfect-first-date","question":"My idea of a perfect first date is...",'
            '"videoUrl":"file:///a.mp4","durationSeconds":10,"transcript":"a transcript",'
            '"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
          ),
        ),
      );

      final answers = await api.fetchMyVideoAnswers();

      expect(answers.first.transcript, 'a transcript');
    });

    test('throws ProfilePromptsApiException on a non-200 response', () async {
      final api = ProfilePromptsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchMyVideoAnswers(), throwsA(isA<ProfilePromptsApiException>()));
    });
  });

  group('ProfilePromptsApi.recordVideoAnswer', () {
    test('sends the prompt id, url, and duration', () async {
      final api = ProfilePromptsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/profile-prompts/video-answers');
          expect(
            request.body,
            '{"promptId":"perfect-first-date","videoUrl":"file:///a.mp4","durationSeconds":10}',
          );
          return _jsonResponse(
            '{"promptId":"perfect-first-date","question":"My idea of a perfect first date is...",'
            '"videoUrl":"file:///a.mp4","durationSeconds":10,"createdAt":"2026-01-01T00:00:00.000Z"}',
            200,
          );
        }),
      );

      final answer = await api.recordVideoAnswer(
        promptId: 'perfect-first-date',
        videoUrl: 'file:///a.mp4',
        durationSeconds: 10,
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
        () => api.recordVideoAnswer(promptId: 'nope', videoUrl: 'x', durationSeconds: 1),
        throwsA(isA<ProfilePromptsApiException>()),
      );
    });
  });

  group('ProfilePromptsApi.deleteVideoAnswer', () {
    test('sends a DELETE to the prompt-specific path', () async {
      final api = ProfilePromptsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'DELETE');
          expect(request.url.path, '/profile-prompts/video-answers/perfect-first-date');
          return http.Response('', 200);
        }),
      );

      await api.deleteVideoAnswer('perfect-first-date');
    });

    test('throws ProfilePromptsApiException when the answer does not exist', () async {
      final api = ProfilePromptsApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse('{"message":"Video answer not found."}', 404),
        ),
      );

      expect(() => api.deleteVideoAnswer('nope'), throwsA(isA<ProfilePromptsApiException>()));
    });
  });

  group('ProfilePromptsApi.fetchMyTextAnswers', () {
    test('parses stored text answers', () async {
      final api = ProfilePromptsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/profile-prompts/text/me');
          return _jsonResponse(
            '[{"promptId":"perfect-first-date","question":"My idea of a perfect first date is...",'
            '"answer":"Sunset walks and tacos.","createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
          );
        }),
      );

      final answers = await api.fetchMyTextAnswers();

      expect(answers, hasLength(1));
      expect(answers.first.answer, 'Sunset walks and tacos.');
    });

    test('throws ProfilePromptsApiException on a non-200 response', () async {
      final api = ProfilePromptsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchMyTextAnswers(), throwsA(isA<ProfilePromptsApiException>()));
    });
  });

  group('ProfilePromptsApi.recordTextAnswer', () {
    test('sends the prompt id and answer', () async {
      final api = ProfilePromptsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/profile-prompts/text-answers');
          expect(
            request.body,
            '{"promptId":"perfect-first-date","answer":"Sunset walks and tacos."}',
          );
          return _jsonResponse(
            '{"promptId":"perfect-first-date","question":"My idea of a perfect first date is...",'
            '"answer":"Sunset walks and tacos.","createdAt":"2026-01-01T00:00:00.000Z"}',
            200,
          );
        }),
      );

      final answer = await api.recordTextAnswer(
        promptId: 'perfect-first-date',
        answer: 'Sunset walks and tacos.',
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
        () => api.recordTextAnswer(promptId: 'nope', answer: 'x'),
        throwsA(isA<ProfilePromptsApiException>()),
      );
    });
  });

  group('ProfilePromptsApi.deleteTextAnswer', () {
    test('sends a DELETE to the prompt-specific path', () async {
      final api = ProfilePromptsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'DELETE');
          expect(request.url.path, '/profile-prompts/text-answers/perfect-first-date');
          return http.Response('', 200);
        }),
      );

      await api.deleteTextAnswer('perfect-first-date');
    });

    test('throws ProfilePromptsApiException when the answer does not exist', () async {
      final api = ProfilePromptsApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse('{"message":"Text answer not found."}', 404),
        ),
      );

      expect(() => api.deleteTextAnswer('nope'), throwsA(isA<ProfilePromptsApiException>()));
    });
  });
}
