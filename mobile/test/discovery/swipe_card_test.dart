import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile/discovery/discovery_api.dart';
import 'package:mobile/discovery/swipe_card.dart';

DeckCard _sampleCard() => DeckCard(id: 'user-2', name: 'Jane', age: 25, interests: const ['Hiking']);

void main() {
  testWidgets('dragging right past the threshold swipes LIKE', (tester) async {
    String? swipedAction;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Center(
            child: SwipeCard(card: _sampleCard(), onSwiped: (action) => swipedAction = action),
          ),
        ),
      ),
    );

    await tester.drag(find.byType(SwipeCard), const Offset(400, 0));
    await tester.pumpAndSettle();

    expect(swipedAction, 'LIKE');
  });

  testWidgets('dragging left past the threshold swipes PASS', (tester) async {
    String? swipedAction;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Center(
            child: SwipeCard(card: _sampleCard(), onSwiped: (action) => swipedAction = action),
          ),
        ),
      ),
    );

    await tester.drag(find.byType(SwipeCard), const Offset(-400, 0));
    await tester.pumpAndSettle();

    expect(swipedAction, 'PASS');
  });

  testWidgets('a small drag under the threshold springs back without swiping', (tester) async {
    String? swipedAction;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Center(
            child: SwipeCard(card: _sampleCard(), onSwiped: (action) => swipedAction = action),
          ),
        ),
      ),
    );

    await tester.drag(find.byType(SwipeCard), const Offset(20, 0));
    await tester.pumpAndSettle();

    expect(swipedAction, isNull);
  });

  testWidgets('shows a mutual connections badge when there are shared contacts', (tester) async {
    final card = DeckCard(
      id: 'user-2',
      name: 'Jane',
      age: 25,
      interests: const ['Hiking'],
      mutualConnectionCount: 3,
    );

    await tester.pumpWidget(
      MaterialApp(home: Scaffold(body: Center(child: SwipeCard(card: card, onSwiped: (_) {})))),
    );

    expect(find.text('3 mutual connections'), findsOneWidget);
  });

  testWidgets('hides the mutual connections badge when there are none', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: Center(child: SwipeCard(card: _sampleCard(), onSwiped: (_) {}))),
      ),
    );

    expect(find.textContaining('mutual connection'), findsNothing);
  });

  testWidgets('shows a playable voice intro control when the card has one', (tester) async {
    final card = DeckCard(
      id: 'user-2',
      name: 'Jane',
      age: 25,
      interests: const ['Hiking'],
      voiceIntroUrl: 'https://cdn.example.com/voice-intro.m4a',
      voiceIntroDurationSeconds: 12,
    );

    await tester.pumpWidget(
      MaterialApp(home: Scaffold(body: Center(child: SwipeCard(card: card, onSwiped: (_) {})))),
    );

    expect(find.text('Voice intro · 12 s'), findsOneWidget);
    expect(find.byIcon(Icons.play_circle), findsOneWidget);
  });

  testWidgets('hides the voice intro control when the card has none', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: Center(child: SwipeCard(card: _sampleCard(), onSwiped: (_) {}))),
      ),
    );

    expect(find.textContaining('Voice intro'), findsNothing);
  });
}
