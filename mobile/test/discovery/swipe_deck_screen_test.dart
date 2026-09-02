import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/discovery/discovery_api.dart';
import 'package:mobile/discovery/profile_visits_api.dart';
import 'package:mobile/discovery/swipe_deck_screen.dart';
import 'package:mobile/messaging/messaging_api.dart';
import 'package:mobile/personality/topic_quiz_api.dart';

const _deckResponse = '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
    '"distanceKm":3.4,"interests":["Hiking"],"relationshipGoal":"CASUAL"}]';

String _fakeToken(Map<String, dynamic> payload) {
  String segment(Object value) =>
      base64Url.encode(utf8.encode(jsonEncode(value))).replaceAll('=', '');
  return '${segment({
        'alg': 'none',
      })}.${segment(payload)}.signature';
}

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

  testWidgets('overlays a watermark derived from the viewer id on the top card', (tester) async {
    final api = DiscoveryApi(
      accessToken: _fakeToken({'sub': 'user-abcdef123456'}),
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          return http.Response(_deckResponse, 200, headers: {'content-type': 'application/json'});
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

    expect(find.text('user-abc'), findsWidgets);
  });

  testWidgets('tapping a card records a profile visit', (tester) async {
    http.Request? visitRequest;
    final discoveryApi = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          return http.Response(_deckResponse, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"active":false,"expiresAt":null,"viewCount":0}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );
    final profileVisitsApi = ProfileVisitsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        visitRequest = request;
        return http.Response('', 201);
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SwipeDeckScreen(discoveryApi: discoveryApi, profileVisitsApi: profileVisitsApi),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Jane, 25'));
    await tester.pumpAndSettle();

    expect(visitRequest, isNotNull);
    expect(visitRequest!.url.path, '/profile-visits/user-2');
    expect(visitRequest!.body, '{"anonymous":false}');
  });

  testWidgets('toggling anonymous browsing records the next visit anonymously', (tester) async {
    http.Request? visitRequest;
    final discoveryApi = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          return http.Response(_deckResponse, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"active":false,"expiresAt":null,"viewCount":0}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );
    final profileVisitsApi = ProfileVisitsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        visitRequest = request;
        return http.Response('', 201);
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SwipeDeckScreen(discoveryApi: discoveryApi, profileVisitsApi: profileVisitsApi),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Browse anonymously (premium)'));
    await tester.pump();

    await tester.tap(find.text('Jane, 25'));
    await tester.pumpAndSettle();

    expect(visitRequest!.body, '{"anonymous":true}');
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

  testWidgets('prompts for deck feedback after 10 continuous swipes and submits the rating', (
    tester,
  ) async {
    final tenCandidateDeck = jsonEncode([
      for (var i = 1; i <= 10; i++)
        {
          'id': 'user-$i',
          'name': 'User $i',
          'age': 25,
          'profilePhotoUrl': null,
          'interests': <String>[],
        },
    ]);
    http.Request? feedbackRequest;
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          return http.Response(tenCandidateDeck, 200, headers: {'content-type': 'application/json'});
        }
        if (request.url.path == '/discovery/deck-feedback') {
          feedbackRequest = request;
          return http.Response(
            '{"discoveryProximityWeight":1.15}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('{"matched":false}', 200, headers: {'content-type': 'application/json'});
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SwipeDeckScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    for (var i = 0; i < 9; i++) {
      await tester.tap(find.byIcon(Icons.favorite));
      await tester.pumpAndSettle();
    }
    expect(find.text('How are these matches?'), findsNothing);

    await tester.tap(find.byIcon(Icons.favorite));
    await tester.pumpAndSettle();

    expect(find.text('How are these matches?'), findsOneWidget);

    await tester.tap(find.text("They're okay"));
    await tester.pumpAndSettle();

    expect(feedbackRequest, isNotNull);
    expect(feedbackRequest!.body, '{"rating":"OKAY"}');
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

  testWidgets('picking a pass reason sends it with the PASS swipe', (tester) async {
    http.Request? swipeRequest;
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          return http.Response(_deckResponse, 200, headers: {'content-type': 'application/json'});
        }
        if (request.url.path == '/discovery/pass-reasons') {
          return http.Response(
            '["Not my type","Too far away"]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        swipeRequest = request;
        return http.Response('{"matched":false}', 200, headers: {'content-type': 'application/json'});
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SwipeDeckScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.close));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Too far away'));
    await tester.pumpAndSettle();

    expect(swipeRequest, isNotNull);
    expect(
      swipeRequest!.body,
      '{"targetUserId":"user-2","action":"PASS","passReason":"Too far away"}',
    );
  });

  testWidgets('skipping the pass reason dialog still records the pass', (tester) async {
    http.Request? swipeRequest;
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          return http.Response(_deckResponse, 200, headers: {'content-type': 'application/json'});
        }
        if (request.url.path == '/discovery/pass-reasons') {
          return http.Response(
            '["Not my type","Too far away"]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        swipeRequest = request;
        return http.Response('{"matched":false}', 200, headers: {'content-type': 'application/json'});
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SwipeDeckScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.close));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Skip'));
    await tester.pumpAndSettle();

    expect(swipeRequest, isNotNull);
    expect(swipeRequest!.body, '{"targetUserId":"user-2","action":"PASS"}');
  });

  testWidgets('composing a note sends a SUPER_LIKE with the text attached', (tester) async {
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

    await tester.enterText(find.byType(TextField), 'Loved your profile!');
    await tester.tap(find.text('Send Super Like'));
    await tester.pumpAndSettle();

    expect(capturedRequest, isNotNull);
    expect(
      capturedRequest!.body,
      '{"targetUserId":"user-2","action":"SUPER_LIKE","complimentText":"Loved your profile!"}',
    );
  });

  testWidgets('cancelling the super like note composer sends nothing', (tester) async {
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

    await tester.tap(find.byIcon(Icons.star));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();

    expect(swipeRequested, isFalse);
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

  testWidgets('picking an icebreaker and an option sends a LIKE with the answer attached', (
    tester,
  ) async {
    http.Request? capturedRequest;
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          return http.Response(_deckResponse, 200, headers: {'content-type': 'application/json'});
        }
        capturedRequest = request;
        return http.Response('{"matched":false}', 200, headers: {'content-type': 'application/json'});
      }),
    );
    final messagingApi = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response(
          '[{"id":"coffee-or-tea","question":"Coffee or tea?","optionA":"Coffee","optionB":"Tea"}]',
          200,
          headers: {'content-type': 'application/json'},
        ),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(home: SwipeDeckScreen(discoveryApi: api, messagingApi: messagingApi)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.quiz_outlined));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Coffee or tea?'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Coffee'));
    await tester.pumpAndSettle();

    expect(capturedRequest, isNotNull);
    expect(
      capturedRequest!.body,
      '{"targetUserId":"user-2","action":"LIKE",'
      '"icebreakerPromptId":"coffee-or-tea","icebreakerOptionIndex":0}',
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

  testWidgets('shows communication boundaries when the candidate shares them', (tester) async {
    const boundariesDeckResponse =
        '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
        '"distanceKm":3.4,"interests":["Hiking"],"relationshipGoal":"CASUAL",'
        '"communicationBoundaries":"Texting only until we meet"}]';
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          return http.Response(
            boundariesDeckResponse,
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

    expect(find.text('Texting only until we meet'), findsOneWidget);
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

  testWidgets('highlights shared interests among the candidate\'s interest chips', (tester) async {
    const sharedInterestsDeckResponse =
        '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
        '"distanceKm":3.4,"interests":["Hiking","Gaming"],"relationshipGoal":"CASUAL",'
        '"sharedInterests":["Hiking"]}]';
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          return http.Response(
            sharedInterestsDeckResponse,
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

    expect(find.text('Hiking'), findsOneWidget);
    expect(find.text('Gaming'), findsOneWidget);
    // One favorite icon for the shared-interest chip, plus one for the
    // persistent "like" floating action button.
    expect(find.byIcon(Icons.favorite), findsNWidgets(2));
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

  testWidgets('long-pressing the boost button activates a Super Boost', (tester) async {
    http.Request? superBoostRequest;
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          return http.Response('[]', 200, headers: {'content-type': 'application/json'});
        }
        if (request.method == 'POST' && request.url.path == '/discovery/boost/super') {
          superBoostRequest = request;
          return http.Response(
            '{"active":true,"expiresAt":"2026-01-01T00:30:00.000Z","viewCount":0,'
            '"tier":"SUPER","viewMultiplier":100}',
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

    await tester.longPress(find.byIcon(Icons.rocket_launch));
    await tester.pumpAndSettle();

    expect(superBoostRequest, isNotNull);
    expect(find.textContaining('Super Boosted (100x views)!'), findsOneWidget);
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

  testWidgets('toggling snooze prompts for a status message, shows the banner, and colors the icon', (
    tester,
  ) async {
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
            '{"snoozedUntil":"2026-01-08T00:00:00.000Z","statusMessage":"On Vacation"}',
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

    expect(find.text('Pause discovery'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'On Vacation');
    await tester.tap(find.widgetWithText(TextButton, 'Snooze'));
    await tester.pumpAndSettle();

    expect(snoozeRequest, isNotNull);
    expect(snoozeRequest!.body, '{"enabled":true,"statusMessage":"On Vacation"}');
    expect(find.textContaining("You're snoozed until"), findsOneWidget);
    expect(find.textContaining('On Vacation'), findsOneWidget);

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

  testWidgets('tapping the video-feed icon opens the video feed', (tester) async {
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/deck') {
          return http.Response('[]', 200, headers: {'content-type': 'application/json'});
        }
        if (request.url.path == '/discovery/video-feed') {
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

    await tester.tap(find.byIcon(Icons.video_collection));
    await tester.pumpAndSettle();

    expect(find.text('Video Feed'), findsOneWidget);
  });

  testWidgets('tapping the compatibility quiz icon asks a question and submits the answer', (
    tester,
  ) async {
    http.Request? answerRequest;
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response('[]', 200, headers: {'content-type': 'application/json'}),
      ),
    );
    final topicQuizApi = TopicQuizApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/topic-quiz/next-question') {
          return http.Response(
            '{"id":"climate-policy","category":"Politics","statement":"Climate policy should be a top priority."}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        answerRequest = request;
        return http.Response('{}', 200, headers: {'content-type': 'application/json'});
      }),
    );

    await tester.pumpWidget(
      MaterialApp(home: SwipeDeckScreen(discoveryApi: api, topicQuizApi: topicQuizApi)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.quiz));
    await tester.pumpAndSettle();

    expect(find.text('Climate policy should be a top priority.'), findsOneWidget);

    await tester.tap(find.text('Agree'));
    await tester.pumpAndSettle();

    expect(answerRequest, isNotNull);
    expect(answerRequest!.body, '{"questionId":"climate-policy","stance":"AGREE"}');
    expect(find.text('Answer saved!'), findsOneWidget);
  });

  testWidgets('tapping the compatibility quiz icon shows a message once everything is answered', (
    tester,
  ) async {
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response('[]', 200, headers: {'content-type': 'application/json'}),
      ),
    );
    final topicQuizApi = TopicQuizApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async => http.Response('null', 200, headers: {'content-type': 'application/json'})),
    );

    await tester.pumpWidget(
      MaterialApp(home: SwipeDeckScreen(discoveryApi: api, topicQuizApi: topicQuizApi)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.quiz));
    await tester.pumpAndSettle();

    expect(find.text("You've answered every compatibility question!"), findsOneWidget);
  });
}
