import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/profile/profile_prompts_api.dart';
import 'package:mobile/profile/voice_player_controller.dart';
import 'package:mobile/profile/voice_prompt_reaction_screen.dart';
import 'package:mobile/profile/voice_recorder_controller.dart';

const _otherUserAnswers =
    '[{"promptId":"perfect-first-date","question":"My idea of a perfect first date is...",'
    '"audioUrl":"file:///a.m4a","durationSeconds":5,"createdAt":"2026-01-01T00:00:00.000Z"}]';

const _otherUserAnswersWithTranscript =
    '[{"promptId":"perfect-first-date","question":"My idea of a perfect first date is...",'
    '"audioUrl":"file:///a.m4a","durationSeconds":5,"transcript":"Un paseo al atardecer.",'
    '"createdAt":"2026-01-01T00:00:00.000Z"}]';

class _FakeRecorder implements VoiceRecorderController {
  bool granted = true;
  bool started = false;
  String stopPath = 'file:///tmp/fake-reply.m4a';

  @override
  Future<bool> hasPermission() async => granted;

  @override
  Future<void> start() async {
    started = true;
  }

  @override
  Future<String?> stop() async => stopPath;
}

class _FakePlayer implements VoicePlayerController {
  String? lastPlayedPath;

  @override
  Future<void> play(String path, {double speed = 1.0}) async {
    lastPlayedPath = path;
  }

  @override
  Future<void> stop() async {}
}

void main() {
  testWidgets('shows the other user\'s voice prompt answers', (tester) async {
    final api = ProfilePromptsApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response(
          _otherUserAnswers,
          200,
          headers: {'content-type': 'application/json'},
        ),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: VoicePromptReactionScreen(
          profilePromptsApi: api,
          otherUserId: 'user-2',
          recorder: _FakeRecorder(),
          player: _FakePlayer(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('My idea of a perfect first date is...'), findsOneWidget);
    expect(find.text('5s answer'), findsOneWidget);
  });

  testWidgets('sends a text-comment reaction', (tester) async {
    http.Request? reactRequest;
    final api = ProfilePromptsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'POST' &&
            request.url.path ==
                '/profile-prompts/perfect-first-date/reactions') {
          reactRequest = request;
          return http.Response(
            '{"id":"reaction-1","fromUserId":"user-1","toUserId":"user-2",'
            '"promptId":"perfect-first-date","comment":"Love this!","audioReplyUrl":null,'
            '"durationSeconds":null,"createdAt":"2026-01-01T00:00:00.000Z"}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          _otherUserAnswers,
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: VoicePromptReactionScreen(
          profilePromptsApi: api,
          otherUserId: 'user-2',
          recorder: _FakeRecorder(),
          player: _FakePlayer(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('React'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'Love this!');
    await tester.tap(find.text('Send'));
    await tester.pumpAndSettle();

    expect(reactRequest, isNotNull);
    expect(
      reactRequest!.body,
      '{"targetUserId":"user-2","comment":"Love this!"}',
    );
    expect(find.text('Reaction sent!'), findsOneWidget);
  });

  testWidgets('records and sends an audio-reply reaction', (tester) async {
    http.Request? reactRequest;
    final api = ProfilePromptsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'POST' &&
            request.url.path ==
                '/profile-prompts/perfect-first-date/reactions') {
          reactRequest = request;
          return http.Response(
            '{"id":"reaction-2","fromUserId":"user-1","toUserId":"user-2",'
            '"promptId":"perfect-first-date","comment":null,'
            '"audioReplyUrl":"file:///tmp/fake-reply.m4a","durationSeconds":2,'
            '"createdAt":"2026-01-01T00:00:00.000Z"}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          _otherUserAnswers,
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );
    final recorder = _FakeRecorder();

    await tester.pumpWidget(
      MaterialApp(
        home: VoicePromptReactionScreen(
          profilePromptsApi: api,
          otherUserId: 'user-2',
          recorder: recorder,
          player: _FakePlayer(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('React'));
    await tester.pumpAndSettle();

    await tester.tap(
      find.widgetWithText(OutlinedButton, 'Record an audio reply (optional)'),
    );
    await tester.pump();
    expect(recorder.started, isTrue);

    await tester.pump(const Duration(seconds: 2));
    await tester.tap(find.text('Stop'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Send'));
    await tester.pumpAndSettle();

    expect(reactRequest, isNotNull);
    expect(
      reactRequest!.body,
      '{"targetUserId":"user-2","audioReplyUrl":"file:///tmp/fake-reply.m4a","durationSeconds":2}',
    );
  });

  testWidgets('translates a voice answer transcript inline', (tester) async {
    http.Request? translateRequest;
    final api = ProfilePromptsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'POST' &&
            request.url.path ==
                '/profile-prompts/user-2/perfect-first-date/translate') {
          translateRequest = request;
          return http.Response(
            '{"translatedText":"A sunset walk."}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          _otherUserAnswersWithTranscript,
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: VoicePromptReactionScreen(
          profilePromptsApi: api,
          otherUserId: 'user-2',
          recorder: _FakeRecorder(),
          player: _FakePlayer(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Un paseo al atardecer.'), findsOneWidget);

    await tester.tap(find.text('Translate'));
    await tester.pumpAndSettle();

    expect(translateRequest, isNotNull);
    expect(find.text('A sunset walk.'), findsOneWidget);
  });
}
