import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/profile/profile_prompts_api.dart';
import 'package:mobile/profile/voice_player_controller.dart';
import 'package:mobile/profile/voice_prompts_screen.dart';
import 'package:mobile/profile/voice_recorder_controller.dart';

const _promptsResponse =
    '[{"id":"perfect-first-date","question":"My idea of a perfect first date is..."}]';

class _FakeRecorder implements VoiceRecorderController {
  bool granted = true;
  bool started = false;
  String stopPath = 'file:///tmp/fake-answer.m4a';

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
  testWidgets('records an answer to a prompt and shows it as answered', (tester) async {
    http.Request? recordRequest;
    final api = ProfilePromptsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile-prompts/items') {
          return http.Response(_promptsResponse, 200, headers: {'content-type': 'application/json'});
        }
        if (request.url.path == '/profile-prompts/me') {
          return http.Response('[]', 200, headers: {'content-type': 'application/json'});
        }
        if (request.method == 'POST' && request.url.path == '/profile-prompts/answers') {
          recordRequest = request;
          return http.Response(
            '{"promptId":"perfect-first-date","question":"My idea of a perfect first date is...",'
            '"audioUrl":"file:///tmp/fake-answer.m4a","durationSeconds":2,'
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
        home: VoicePromptsScreen(profilePromptsApi: api, recorder: recorder, player: player),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('My idea of a perfect first date is...'), findsOneWidget);

    await tester.tap(find.widgetWithText(ElevatedButton, 'Record answer'));
    await tester.pump();
    expect(recorder.started, isTrue);

    await tester.pump(const Duration(seconds: 2));
    await tester.tap(find.widgetWithText(ElevatedButton, 'Stop'));
    await tester.pumpAndSettle();

    expect(recordRequest, isNotNull);
    expect(
      recordRequest!.body,
      '{"promptId":"perfect-first-date","audioUrl":"file:///tmp/fake-answer.m4a","durationSeconds":2}',
    );
    expect(find.text('2s answer'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.play_arrow));
    await tester.pump();
    expect(player.lastPlayedPath, 'file:///tmp/fake-answer.m4a');
  });

  testWidgets('shows an error when microphone permission is denied', (tester) async {
    final api = ProfilePromptsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile-prompts/items') {
          return http.Response(_promptsResponse, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response('[]', 200, headers: {'content-type': 'application/json'});
      }),
    );
    final recorder = _FakeRecorder()..granted = false;
    final player = _FakePlayer();

    await tester.pumpWidget(
      MaterialApp(
        home: VoicePromptsScreen(profilePromptsApi: api, recorder: recorder, player: player),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Record answer'));
    await tester.pump();

    expect(find.text('Microphone permission is required to record an answer.'), findsOneWidget);
    expect(recorder.started, isFalse);
  });

  testWidgets('deleting an existing answer removes it from the list', (tester) async {
    final api = ProfilePromptsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile-prompts/items') {
          return http.Response(_promptsResponse, 200, headers: {'content-type': 'application/json'});
        }
        if (request.url.path == '/profile-prompts/me') {
          return http.Response(
            '[{"promptId":"perfect-first-date","question":"My idea of a perfect first date is...",'
            '"audioUrl":"file:///a.m4a","durationSeconds":5,"createdAt":"2026-01-01T00:00:00.000Z"}]',
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
        home: VoicePromptsScreen(
          profilePromptsApi: api,
          recorder: _FakeRecorder(),
          player: _FakePlayer(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('5s answer'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.delete_outline));
    await tester.pumpAndSettle();

    expect(find.text('5s answer'), findsNothing);
    expect(find.widgetWithText(ElevatedButton, 'Record answer'), findsOneWidget);
  });
}
