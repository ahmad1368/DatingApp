import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile/profile/voice_intro_player.dart';
import 'package:mobile/profile/voice_player_controller.dart';

class _FakePlayer implements VoicePlayerController {
  String? lastPlayedPath;
  bool stopped = false;

  @override
  Future<void> play(String path, {double speed = 1.0}) async {
    lastPlayedPath = path;
  }

  @override
  Future<void> stop() async {
    stopped = true;
  }
}

void main() {
  testWidgets('toggles between play and stop', (tester) async {
    final player = _FakePlayer();

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Center(
            child: VoiceIntroPlayer(
              url: 'file:///tmp/intro.m4a',
              durationSeconds: 12,
              player: player,
            ),
          ),
        ),
      ),
    );

    expect(find.text('Voice intro · 12 s'), findsOneWidget);
    expect(find.byIcon(Icons.play_circle), findsOneWidget);

    await tester.tap(find.byIcon(Icons.play_circle));
    await tester.pump();

    expect(player.lastPlayedPath, 'file:///tmp/intro.m4a');
    expect(find.byIcon(Icons.stop_circle), findsOneWidget);

    await tester.tap(find.byIcon(Icons.stop_circle));
    await tester.pump();

    expect(player.stopped, isTrue);
    expect(find.byIcon(Icons.play_circle), findsOneWidget);
  });
}
