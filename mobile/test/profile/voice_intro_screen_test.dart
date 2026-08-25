import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/profile/voice_intro_api.dart';
import 'package:mobile/profile/voice_intro_screen.dart';
import 'package:mobile/profile/voice_player_controller.dart';
import 'package:mobile/profile/voice_recorder_controller.dart';

class _FakeRecorder implements VoiceRecorderController {
  bool granted = true;
  bool started = false;
  String stopPath = 'file:///tmp/fake-intro.m4a';

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
  testWidgets('records for a few seconds, then previews and saves', (tester) async {
    http.Request? capturedRequest;
    final api = VoiceIntroApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        capturedRequest = request;
        return http.Response(
          '{"url":"file:///tmp/fake-intro.m4a","durationSeconds":2}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );
    final recorder = _FakeRecorder();
    final player = _FakePlayer();

    await tester.pumpWidget(
      MaterialApp(
        home: VoiceIntroScreen(voiceIntroApi: api, recorder: recorder, player: player),
      ),
    );

    await tester.tap(find.widgetWithText(ElevatedButton, 'Record'));
    await tester.pump();
    expect(recorder.started, isTrue);
    expect(find.widgetWithText(ElevatedButton, 'Stop'), findsOneWidget);

    await tester.pump(const Duration(seconds: 2));
    await tester.tap(find.widgetWithText(ElevatedButton, 'Stop'));
    await tester.pump();

    expect(find.text('Recorded: 2 s'), findsOneWidget);

    await tester.tap(find.widgetWithText(OutlinedButton, 'Play preview'));
    await tester.pump();
    expect(player.lastPlayedPath, 'file:///tmp/fake-intro.m4a');

    await tester.tap(find.widgetWithText(ElevatedButton, 'Save'));
    await tester.pumpAndSettle();

    expect(capturedRequest, isNotNull);
    expect(capturedRequest!.body, '{"url":"file:///tmp/fake-intro.m4a","durationSeconds":2}');
    expect(find.text('Voice intro saved.'), findsOneWidget);
  });

  testWidgets('auto-stops recording at 30 seconds', (tester) async {
    final api = VoiceIntroApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async => http.Response('', 500)),
    );
    final recorder = _FakeRecorder();
    final player = _FakePlayer();

    await tester.pumpWidget(
      MaterialApp(
        home: VoiceIntroScreen(voiceIntroApi: api, recorder: recorder, player: player),
      ),
    );

    await tester.tap(find.widgetWithText(ElevatedButton, 'Record'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 30));

    expect(find.widgetWithText(ElevatedButton, 'Record'), findsOneWidget);
    expect(find.text('Recorded: 30 s'), findsOneWidget);
  });

  testWidgets('shows an error when microphone permission is denied', (tester) async {
    final api = VoiceIntroApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async => http.Response('', 500)),
    );
    final recorder = _FakeRecorder()..granted = false;
    final player = _FakePlayer();

    await tester.pumpWidget(
      MaterialApp(
        home: VoiceIntroScreen(voiceIntroApi: api, recorder: recorder, player: player),
      ),
    );

    await tester.tap(find.widgetWithText(ElevatedButton, 'Record'));
    await tester.pump();

    expect(
      find.text('Microphone permission is required to record a voice intro.'),
      findsOneWidget,
    );
    expect(recorder.started, isFalse);
  });
}
