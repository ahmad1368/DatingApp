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
}
