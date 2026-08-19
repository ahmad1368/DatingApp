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
}
