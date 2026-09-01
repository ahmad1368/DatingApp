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

  testWidgets('shows a chip for each shared community group', (tester) async {
    final card = DeckCard(
      id: 'user-2',
      name: 'Jane',
      age: 25,
      interests: const ['Hiking'],
      sharedCommunityGroups: const ['Gamers', 'Foodies'],
    );

    await tester.pumpWidget(
      MaterialApp(home: Scaffold(body: Center(child: SwipeCard(card: card, onSwiped: (_) {})))),
    );

    expect(find.text('Gamers'), findsOneWidget);
    expect(find.text('Foodies'), findsOneWidget);
  });

  testWidgets('shows no community group chips when there is no shared membership', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: Center(child: SwipeCard(card: _sampleCard(), onSwiped: (_) {}))),
      ),
    );

    expect(find.byIcon(Icons.groups), findsNothing);
  });

  testWidgets('shows a shared school badge when the candidate attended the same school', (tester) async {
    final card = DeckCard(
      id: 'user-2',
      name: 'Jane',
      age: 25,
      interests: const ['Hiking'],
      sharedSchool: 'NYU',
    );

    await tester.pumpWidget(
      MaterialApp(home: Scaffold(body: Center(child: SwipeCard(card: card, onSwiped: (_) {})))),
    );

    expect(find.text('You both went to NYU'), findsOneWidget);
    expect(find.byIcon(Icons.school), findsOneWidget);
  });

  testWidgets('hides the shared school badge when there is no shared school', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: Center(child: SwipeCard(card: _sampleCard(), onSwiped: (_) {}))),
      ),
    );

    expect(find.textContaining('went to'), findsNothing);
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

  testWidgets('shows a labeled relationship goal badge when present', (tester) async {
    final card = DeckCard(
      id: 'user-2',
      name: 'Jane',
      age: 25,
      interests: const ['Hiking'],
      relationshipGoal: 'LONG_TERM',
    );

    await tester.pumpWidget(
      MaterialApp(home: Scaffold(body: Center(child: SwipeCard(card: card, onSwiped: (_) {})))),
    );

    expect(find.text('Long-term relationship'), findsOneWidget);
    expect(find.byIcon(Icons.flag), findsOneWidget);
  });

  testWidgets('falls back to the raw value for an unrecognized relationship goal', (tester) async {
    final card = DeckCard(
      id: 'user-2',
      name: 'Jane',
      age: 25,
      interests: const ['Hiking'],
      relationshipGoal: 'SOMETHING_NEW',
    );

    await tester.pumpWidget(
      MaterialApp(home: Scaffold(body: Center(child: SwipeCard(card: card, onSwiped: (_) {})))),
    );

    expect(find.text('SOMETHING_NEW'), findsOneWidget);
  });

  testWidgets('hides the relationship goal badge when absent', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: Center(child: SwipeCard(card: _sampleCard(), onSwiped: (_) {}))),
      ),
    );

    expect(find.byIcon(Icons.flag), findsNothing);
  });

  testWidgets('shows relationship structure and kink tag badges when present', (tester) async {
    final card = DeckCard(
      id: 'user-2',
      name: 'Jane',
      age: 25,
      interests: const ['Hiking'],
      relationshipStructure: 'Solo Polyamorous',
      kinkTagBadges: const ['Dominant'],
    );

    await tester.pumpWidget(
      MaterialApp(home: Scaffold(body: Center(child: SwipeCard(card: card, onSwiped: (_) {})))),
    );

    expect(find.text('Solo Polyamorous'), findsOneWidget);
    expect(find.text('Dominant'), findsOneWidget);
  });

  testWidgets('hides relationship structure and kink tag badges when absent', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: Center(child: SwipeCard(card: _sampleCard(), onSwiped: (_) {}))),
      ),
    );

    expect(find.byIcon(Icons.diversity_3), findsNothing);
  });

  testWidgets('shows the profile photo unblurred by default', (tester) async {
    final card = DeckCard(
      id: 'user-2',
      name: 'Jane',
      age: 25,
      interests: const ['Hiking'],
      profilePhotoUrl: 'https://example.com/jane.jpg',
    );

    await tester.pumpWidget(
      MaterialApp(home: Scaffold(body: Center(child: SwipeCard(card: card, onSwiped: (_) {})))),
    );
    await tester.pumpAndSettle();

    expect(find.byType(Image), findsOneWidget);
    expect(find.byType(ImageFiltered), findsNothing);
  });

  testWidgets('blurs the profile photo when the candidate opted into incognito blur', (tester) async {
    final card = DeckCard(
      id: 'user-2',
      name: 'Jane',
      age: 25,
      interests: const ['Hiking'],
      profilePhotoUrl: 'https://example.com/jane.jpg',
      profilePhotoBlurred: true,
    );

    await tester.pumpWidget(
      MaterialApp(home: Scaffold(body: Center(child: SwipeCard(card: card, onSwiped: (_) {})))),
    );
    await tester.pumpAndSettle();

    expect(find.byType(ImageFiltered), findsOneWidget);
    expect(
      find.descendant(of: find.byType(ImageFiltered), matching: find.byType(Image)),
      findsOneWidget,
    );
  });
}
