import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/discovery/discovery_api.dart';
import 'package:mobile/discovery/liked_by_grid_screen.dart';

const _gridResponse = '[{"id":"user-3","name":"Sam","age":29,"profilePhotoUrl":null,'
    '"distanceKm":1.2,"interests":["Coffee"],"relationshipGoal":"CASUAL","isSuperLike":true}]';

void main() {
  testWidgets('shows an empty state when nobody has liked the user', (tester) async {
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response('[]', 200, headers: {'content-type': 'application/json'}),
      ),
    );

    await tester.pumpWidget(MaterialApp(home: LikedByGridScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('No likes yet. Keep swiping!'), findsOneWidget);
  });

  testWidgets('shows an upsell error for a non-premium user', (tester) async {
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response(
          '{"message":"Seeing who liked you is a premium feature."}',
          403,
          headers: {'content-type': 'application/json'},
        ),
      ),
    );

    await tester.pumpWidget(MaterialApp(home: LikedByGridScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Seeing who liked you is a premium feature.'), findsOneWidget);
  });

  testWidgets('renders liker cards with a super-like badge', (tester) async {
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async =>
            http.Response(_gridResponse, 200, headers: {'content-type': 'application/json'}),
      ),
    );

    await tester.pumpWidget(MaterialApp(home: LikedByGridScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Sam, 29'), findsOneWidget);
    expect(find.byIcon(Icons.star), findsOneWidget);
  });

  testWidgets('shows a compliment attached to a liker card', (tester) async {
    const complimentedResponse =
        '[{"id":"user-3","name":"Sam","age":29,"profilePhotoUrl":null,'
        '"distanceKm":1.2,"interests":["Coffee"],"relationshipGoal":"CASUAL",'
        '"complimentText":"Love your hiking photo!","complimentTarget":"your hiking photo"}]';
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async =>
            http.Response(complimentedResponse, 200, headers: {'content-type': 'application/json'}),
      ),
    );

    await tester.pumpWidget(MaterialApp(home: LikedByGridScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('"Love your hiking photo!"'), findsOneWidget);
  });

  testWidgets('liking back records a swipe and shows a match banner', (tester) async {
    http.Request? capturedRequest;
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/likes') {
          return http.Response(_gridResponse, 200, headers: {'content-type': 'application/json'});
        }
        capturedRequest = request;
        return http.Response(
          '{"matched":true,"matchId":"match-1"}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: LikedByGridScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.favorite));
    await tester.pumpAndSettle();

    expect(capturedRequest, isNotNull);
    expect(capturedRequest!.body, '{"targetUserId":"user-3","action":"LIKE"}');
    expect(find.text("It's a match with Sam!"), findsOneWidget);
    expect(find.text('No likes yet. Keep swiping!'), findsOneWidget);
  });

  testWidgets('re-sorting by nearest reloads the grid with the sortBy query param', (tester) async {
    final requestedSorts = <String?>[];
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        requestedSorts.add(request.url.queryParameters['sortBy']);
        return http.Response(_gridResponse, 200, headers: {'content-type': 'application/json'});
      }),
    );

    await tester.pumpWidget(MaterialApp(home: LikedByGridScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.sort));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Nearest'));
    await tester.pumpAndSettle();

    expect(requestedSorts, ['RECENT', 'PROXIMITY']);
  });

  testWidgets('passing removes the card without a match banner', (tester) async {
    http.Request? capturedRequest;
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/likes') {
          return http.Response(_gridResponse, 200, headers: {'content-type': 'application/json'});
        }
        capturedRequest = request;
        return http.Response('{"matched":false}', 200, headers: {'content-type': 'application/json'});
      }),
    );

    await tester.pumpWidget(MaterialApp(home: LikedByGridScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.close));
    await tester.pumpAndSettle();

    expect(capturedRequest, isNotNull);
    expect(capturedRequest!.body, '{"targetUserId":"user-3","action":"PASS"}');
    expect(find.textContaining('match'), findsNothing);
    expect(find.text('No likes yet. Keep swiping!'), findsOneWidget);
  });
}
