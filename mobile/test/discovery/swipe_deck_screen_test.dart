import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/discovery/discovery_api.dart';
import 'package:mobile/discovery/swipe_deck_screen.dart';

const _deckResponse = '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
    '"distanceKm":3.4,"interests":["Hiking"],"relationshipGoal":"CASUAL"}]';

void main() {
  testWidgets('shows an empty state when there are no more candidates', (tester) async {
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response('[]', 200, headers: {'content-type': 'application/json'}),
      ),
    );

    await tester.pumpWidget(MaterialApp(home: SwipeDeckScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('No more profiles nearby. Check back later!'), findsOneWidget);
  });

  testWidgets('tapping like records a swipe and shows a match banner', (tester) async {
    http.Request? capturedRequest;
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          return http.Response(_deckResponse, 200, headers: {'content-type': 'application/json'});
        }
        capturedRequest = request;
        return http.Response(
          '{"matched":true,"matchId":"match-1"}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SwipeDeckScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Jane, 25'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.favorite));
    await tester.pumpAndSettle();

    expect(capturedRequest, isNotNull);
    expect(capturedRequest!.body, '{"targetUserId":"user-2","action":"LIKE"}');
    expect(find.text("It's a match with Jane!"), findsOneWidget);
    expect(find.text('No more profiles nearby. Check back later!'), findsOneWidget);
  });

  testWidgets('tapping pass records a swipe without a match banner', (tester) async {
    http.Request? capturedRequest;
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          return http.Response(_deckResponse, 200, headers: {'content-type': 'application/json'});
        }
        capturedRequest = request;
        return http.Response(
          '{"matched":false}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SwipeDeckScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.close));
    await tester.pumpAndSettle();

    expect(capturedRequest, isNotNull);
    expect(capturedRequest!.body, '{"targetUserId":"user-2","action":"PASS"}');
    expect(find.textContaining('match'), findsNothing);
  });

  testWidgets('tapping super like records a SUPER_LIKE swipe', (tester) async {
    http.Request? capturedRequest;
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          return http.Response(_deckResponse, 200, headers: {'content-type': 'application/json'});
        }
        capturedRequest = request;
        return http.Response(
          '{"matched":false}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SwipeDeckScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.star));
    await tester.pumpAndSettle();

    expect(capturedRequest, isNotNull);
    expect(capturedRequest!.body, '{"targetUserId":"user-2","action":"SUPER_LIKE"}');
  });

  testWidgets('composing a compliment sends a LIKE with the text attached', (tester) async {
    http.Request? capturedRequest;
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          return http.Response(_deckResponse, 200, headers: {'content-type': 'application/json'});
        }
        capturedRequest = request;
        return http.Response(
          '{"matched":false}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SwipeDeckScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.comment));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'Love your hiking photo!');
    await tester.tap(find.text('Send with like'));
    await tester.pumpAndSettle();

    expect(capturedRequest, isNotNull);
    expect(
      capturedRequest!.body,
      '{"targetUserId":"user-2","action":"LIKE","complimentText":"Love your hiking photo!"}',
    );
  });

  testWidgets('canceling the compliment dialog does not send a swipe', (tester) async {
    var swipeRequested = false;
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          return http.Response(_deckResponse, 200, headers: {'content-type': 'application/json'});
        }
        if (request.url.path == '/discovery/swipe') {
          swipeRequested = true;
          return http.Response('{"matched":false}', 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"active":false,"expiresAt":null,"viewCount":0}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SwipeDeckScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.comment));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();

    expect(swipeRequested, isFalse);
    expect(find.text('Jane, 25'), findsOneWidget);
  });

  testWidgets('shows a super-like badge when the candidate super liked the user', (tester) async {
    const superLikedDeckResponse =
        '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
        '"distanceKm":3.4,"interests":["Hiking"],"relationshipGoal":"CASUAL","isSuperLike":true}]';
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          return http.Response(
            superLikedDeckResponse,
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"active":false,"expiresAt":null,"viewCount":0}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SwipeDeckScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Super Liked You'), findsOneWidget);
  });

  testWidgets('shows a priority-like badge when a premium user liked the candidate', (tester) async {
    const priorityLikedDeckResponse =
        '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
        '"distanceKm":3.4,"interests":["Hiking"],"relationshipGoal":"CASUAL","isPriorityLike":true}]';
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          return http.Response(
            priorityLikedDeckResponse,
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"active":false,"expiresAt":null,"viewCount":0}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SwipeDeckScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Liked You'), findsOneWidget);
  });

  testWidgets('shows relationship intent badges when the candidate has them', (tester) async {
    const badgedDeckResponse =
        '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
        '"distanceKm":3.4,"interests":["Hiking"],"relationshipGoal":"CASUAL",'
        '"relationshipIntentBadges":["Marriage","Long-Term Relationship"]}]';
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          return http.Response(
            badgedDeckResponse,
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"active":false,"expiresAt":null,"viewCount":0}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SwipeDeckScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Marriage'), findsOneWidget);
    expect(find.text('Long-Term Relationship'), findsOneWidget);
  });

  testWidgets('shows lifestyle badges when the candidate has them', (tester) async {
    const badgedDeckResponse =
        '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
        '"distanceKm":3.4,"interests":["Hiking"],"relationshipGoal":"CASUAL",'
        '"lifestyleBadges":["178 cm","Workout: Often","Dog"]}]';
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          return http.Response(
            badgedDeckResponse,
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"active":false,"expiresAt":null,"viewCount":0}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SwipeDeckScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('178 cm'), findsOneWidget);
    expect(find.text('Workout: Often'), findsOneWidget);
    expect(find.text('Dog'), findsOneWidget);
  });

  testWidgets('shows the zodiac sign badge when the candidate has one', (tester) async {
    const zodiacDeckResponse =
        '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
        '"distanceKm":3.4,"interests":["Hiking"],"relationshipGoal":"CASUAL","zodiacSign":"Leo"}]';
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          return http.Response(
            zodiacDeckResponse,
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"active":false,"expiresAt":null,"viewCount":0}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SwipeDeckScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Leo'), findsOneWidget);
  });

  testWidgets('shows love style badges when the candidate has them', (tester) async {
    const loveStyleDeckResponse =
        '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
        '"distanceKm":3.4,"interests":["Hiking"],"relationshipGoal":"CASUAL",'
        '"loveStyleBadges":["Physical Touch","Secure Attachment"]}]';
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          return http.Response(
            loveStyleDeckResponse,
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"active":false,"expiresAt":null,"viewCount":0}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SwipeDeckScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Physical Touch'), findsOneWidget);
    expect(find.text('Secure Attachment'), findsOneWidget);
  });

  testWidgets('shows a boosted badge when the candidate is boosted', (tester) async {
    const boostedDeckResponse =
        '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
        '"distanceKm":3.4,"interests":["Hiking"],"relationshipGoal":"CASUAL","isBoosted":true}]';
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          return http.Response(
            boostedDeckResponse,
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"active":false,"expiresAt":null,"viewCount":0}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SwipeDeckScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Boosted'), findsOneWidget);
  });

  testWidgets('shows a play icon when the candidate has a video snippet', (tester) async {
    const videoDeckResponse =
        '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
        '"videoSnippetUrl":"https://example.com/snippet.mp4",'
        '"distanceKm":3.4,"interests":["Hiking"],"relationshipGoal":"CASUAL"}]';
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          return http.Response(
            videoDeckResponse,
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"active":false,"expiresAt":null,"viewCount":0}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SwipeDeckScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    expect(find.byIcon(Icons.play_circle_fill), findsOneWidget);
  });

  testWidgets('tapping rewind undoes the last swipe and reloads the deck', (tester) async {
    var deckCallCount = 0;
    http.Request? undoRequest;
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          deckCallCount += 1;
          return http.Response('[]', 200, headers: {'content-type': 'application/json'});
        }
        undoRequest = request;
        return http.Response(
          '{"targetUserId":"user-2","action":"PASS","hadMatch":false}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SwipeDeckScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.undo));
    await tester.pumpAndSettle();

    expect(undoRequest, isNotNull);
    expect(undoRequest!.method, 'POST');
    expect(undoRequest!.url.path, '/discovery/undo');
    expect(deckCallCount, 2);
  });

  testWidgets('shows an error when rewind is rejected for a non-premium user', (tester) async {
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          return http.Response('[]', 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"message":"Rewind is a premium feature."}',
          403,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SwipeDeckScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.undo));
    await tester.pumpAndSettle();

    expect(find.text('Rewind is a premium feature.'), findsOneWidget);
  });

  testWidgets('toggling incognito switches the visibility icon', (tester) async {
    http.Request? incognitoRequest;
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          return http.Response('[]', 200, headers: {'content-type': 'application/json'});
        }
        incognitoRequest = request;
        return http.Response(
          '{"incognitoEnabled":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SwipeDeckScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    expect(find.byIcon(Icons.visibility), findsOneWidget);

    await tester.tap(find.byIcon(Icons.visibility));
    await tester.pumpAndSettle();

    expect(incognitoRequest, isNotNull);
    expect(incognitoRequest!.method, 'PUT');
    expect(incognitoRequest!.body, '{"enabled":true}');
    expect(find.byIcon(Icons.visibility_off), findsOneWidget);
  });

  testWidgets('shows an error when incognito is rejected for a non-premium user', (tester) async {
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          return http.Response('[]', 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"message":"Incognito mode is a premium feature."}',
          403,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SwipeDeckScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.visibility));
    await tester.pumpAndSettle();

    expect(find.text('Incognito mode is a premium feature.'), findsOneWidget);
  });

  testWidgets('activating boost shows the banner and disables the button', (tester) async {
    http.Request? boostActivateRequest;
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          return http.Response('[]', 200, headers: {'content-type': 'application/json'});
        }
        if (request.method == 'POST' && request.url.path == '/discovery/boost') {
          boostActivateRequest = request;
          return http.Response(
            '{"active":true,"expiresAt":"2026-01-01T00:30:00.000Z","viewCount":0}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"active":false,"expiresAt":null,"viewCount":0}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SwipeDeckScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.rocket_launch));
    await tester.pumpAndSettle();

    expect(boostActivateRequest, isNotNull);
    expect(find.textContaining('Boosted!'), findsOneWidget);

    final button = tester.widget<IconButton>(
      find.ancestor(of: find.byIcon(Icons.rocket_launch), matching: find.byType(IconButton)),
    );
    expect(button.onPressed, isNull);
  });

  testWidgets('shows an existing active boost on load', (tester) async {
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          return http.Response('[]', 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"active":true,"expiresAt":"2026-01-01T00:30:00.000Z","viewCount":7}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SwipeDeckScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Boosted! 7 extra views so far.'), findsOneWidget);
  });

  testWidgets('switching mode calls the API and reloads the deck', (tester) async {
    http.Request? modeRequest;
    var deckCallCount = 0;
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          deckCallCount += 1;
          return http.Response('[]', 200, headers: {'content-type': 'application/json'});
        }
        if (request.method == 'PUT' && request.url.path == '/discovery/mode') {
          modeRequest = request;
          return http.Response(
            '{"activeMode":"BFF"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"active":false,"expiresAt":null,"viewCount":0}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SwipeDeckScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Discover · Dating'), findsOneWidget);

    await tester.tap(find.text('Discover · Dating'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('BFF').last);
    await tester.pumpAndSettle();

    expect(modeRequest, isNotNull);
    expect(modeRequest!.body, '{"mode":"BFF"}');
    expect(find.text('Discover · BFF'), findsOneWidget);
    expect(deckCallCount, 2);
  });

  testWidgets('toggling snooze shows the banner and colors the icon', (tester) async {
    http.Request? snoozeRequest;
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          return http.Response('[]', 200, headers: {'content-type': 'application/json'});
        }
        if (request.method == 'PUT' && request.url.path == '/discovery/snooze') {
          snoozeRequest = request;
          return http.Response(
            '{"snoozedUntil":"2026-01-08T00:00:00.000Z"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path == '/discovery/snooze') {
          return http.Response(
            '{"snoozedUntil":null}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"active":false,"expiresAt":null,"viewCount":0}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SwipeDeckScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.bedtime));
    await tester.pumpAndSettle();

    expect(snoozeRequest, isNotNull);
    expect(snoozeRequest!.body, '{"enabled":true}');
    expect(find.textContaining("You're snoozed until"), findsOneWidget);

    final button = tester.widget<IconButton>(
      find.ancestor(of: find.byIcon(Icons.bedtime), matching: find.byType(IconButton)),
    );
    expect(button.color, Colors.indigo);
  });

  testWidgets('tapping the who-liked-you icon opens the likes grid', (tester) async {
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          return http.Response('[]', 200, headers: {'content-type': 'application/json'});
        }
        if (request.url.path == '/discovery/likes') {
          return http.Response('[]', 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"active":false,"expiresAt":null,"viewCount":0}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SwipeDeckScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.grid_view));
    await tester.pumpAndSettle();

    expect(find.text('Who Liked You'), findsOneWidget);
  });
}
