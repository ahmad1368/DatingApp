import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile/messaging/voice_waveform.dart';

void main() {
  testWidgets('renders the requested number of bars', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: VoiceWaveform(seed: 'message-1', onTap: () {}, barCount: 10)),
      ),
    );

    expect(find.byType(Container), findsNWidgets(10));
  });

  testWidgets('tapping the waveform invokes onTap', (tester) async {
    var tapped = false;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: VoiceWaveform(seed: 'message-1', onTap: () => tapped = true)),
      ),
    );
    await tester.tap(find.byType(VoiceWaveform));

    expect(tapped, isTrue);
  });

  testWidgets('the same seed always produces the same bar heights', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Column(
            children: [
              VoiceWaveform(key: const Key('a'), seed: 'same-seed', onTap: () {}, barCount: 5),
              VoiceWaveform(key: const Key('b'), seed: 'same-seed', onTap: () {}, barCount: 5),
            ],
          ),
        ),
      ),
    );

    final heightsA = tester
        .widgetList<Container>(find.descendant(of: find.byKey(const Key('a')), matching: find.byType(Container)))
        .map((container) => (container.constraints as BoxConstraints).maxHeight)
        .toList();
    final heightsB = tester
        .widgetList<Container>(find.descendant(of: find.byKey(const Key('b')), matching: find.byType(Container)))
        .map((container) => (container.constraints as BoxConstraints).maxHeight)
        .toList();

    expect(heightsA, heightsB);
  });
}
