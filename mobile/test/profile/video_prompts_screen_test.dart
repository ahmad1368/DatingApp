import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/profile/profile_prompts_api.dart';
import 'package:mobile/profile/video_answer_player_controller.dart';
import 'package:mobile/profile/video_prompts_screen.dart';
import 'package:mobile/profile/video_recorder_controller.dart';

const _promptsResponse =
    '[{"id":"perfect-first-date","question":"My idea of a perfect first date is..."}]';

class _FakeRecorder implements VideoRecorderController {
  RecordedVideo? nextResult = RecordedVideo(path: 'file:///tmp/fake-answer.mp4', durationSeconds: 8);

  @override
  Future<RecordedVideo?> record() async => nextResult;
}

class _FakePlayer implements VideoAnswerPlayerController {
  String? lastPlayedPath;

  @override
  Future<void> play(String path) async {
    lastPlayedPath = path;
  }

  @override
  Future<void> stop() async {}
}

void main() {
  testWidgets('records a video answer to a prompt and shows it as answered', (tester) async {
    http.Request? recordRequest;
    final api = ProfilePromptsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile-prompts/items') {
          return http.Response(_promptsResponse, 200, headers: {'content-type': 'application/json'});
        }
        if (request.url.path == '/profile-prompts/video/me') {
          return http.Response('[]', 200, headers: {'content-type': 'application/json'});
        }
        if (request.method == 'POST' && request.url.path == '/profile-prompts/video-answers') {
          recordRequest = request;
          return http.Response(
            '{"promptId":"perfect-first-date","question":"My idea of a perfect first date is...",'
            '"videoUrl":"file:///tmp/fake-answer.mp4","durationSeconds":8,'
            '"createdAt":"2026-01-01T00:00:00.000Z"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('', 500);
      }),
    );
    final recorder = _FakeRecorder();
    final player = _FakePlayer();

    await tester.pumpWidget(
      MaterialApp(
        home: VideoPromptsScreen(profilePromptsApi: api, recorder: recorder, player: player),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('My idea of a perfect first date is...'), findsOneWidget);

    await tester.tap(find.widgetWithText(ElevatedButton, 'Record video answer'));
    await tester.pumpAndSettle();

    expect(recordRequest, isNotNull);
    expect(
      recordRequest!.body,
      '{"promptId":"perfect-first-date","videoUrl":"file:///tmp/fake-answer.mp4","durationSeconds":8}',
    );
    expect(find.text('8s video'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.play_arrow));
    await tester.pump();
    expect(player.lastPlayedPath, 'file:///tmp/fake-answer.mp4');
  });

  testWidgets('cancelling the camera leaves the prompt unanswered', (tester) async {
    final api = ProfilePromptsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile-prompts/items') {
          return http.Response(_promptsResponse, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response('[]', 200, headers: {'content-type': 'application/json'});
      }),
    );
    final recorder = _FakeRecorder()..nextResult = null;
    final player = _FakePlayer();

    await tester.pumpWidget(
      MaterialApp(
        home: VideoPromptsScreen(profilePromptsApi: api, recorder: recorder, player: player),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Record video answer'));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(ElevatedButton, 'Record video answer'), findsOneWidget);
  });

  testWidgets('deleting an existing video answer removes it from the list', (tester) async {
    final api = ProfilePromptsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile-prompts/items') {
          return http.Response(_promptsResponse, 200, headers: {'content-type': 'application/json'});
        }
        if (request.url.path == '/profile-prompts/video/me') {
          return http.Response(
            '[{"promptId":"perfect-first-date","question":"My idea of a perfect first date is...",'
            '"videoUrl":"file:///a.mp4","durationSeconds":5,"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.method == 'DELETE') {
          return http.Response('', 200);
        }
        return http.Response('', 500);
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: VideoPromptsScreen(
          profilePromptsApi: api,
          recorder: _FakeRecorder(),
          player: _FakePlayer(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('5s video'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.delete_outline));
    await tester.pumpAndSettle();

    expect(find.text('5s video'), findsNothing);
    expect(find.widgetWithText(ElevatedButton, 'Record video answer'), findsOneWidget);
  });
}
