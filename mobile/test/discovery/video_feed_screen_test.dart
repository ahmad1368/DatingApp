import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/discovery/discovery_api.dart';
import 'package:mobile/discovery/video_feed_screen.dart';

const _feedResponse = '[{"id":"user-2","name":"Jane","age":25,'
    '"videoUrl":"https://example.com/snippet.mp4","videoSource":"SNIPPET",'
    '"promptQuestion":null}]';

void main() {
  testWidgets('shows an empty state when there are no video candidates', (tester) async {
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response('[]', 200, headers: {'content-type': 'application/json'}),
      ),
    );

    await tester.pumpWidget(MaterialApp(home: VideoFeedScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('No video profiles nearby right now.'), findsOneWidget);
  });

  testWidgets('renders a video card with its play-icon placeholder', (tester) async {
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async =>
            http.Response(_feedResponse, 200, headers: {'content-type': 'application/json'}),
      ),
    );

    await tester.pumpWidget(MaterialApp(home: VideoFeedScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Jane, 25'), findsOneWidget);
    expect(find.byIcon(Icons.play_circle_fill), findsOneWidget);
  });

  testWidgets('shows the prompt question for a prompt-answer video card', (tester) async {
    const promptResponse = '[{"id":"user-3","name":"Sam","age":29,'
        '"videoUrl":"https://example.com/answer.mp4","videoSource":"PROMPT_ANSWER",'
        '"promptQuestion":"What is your simple pleasure?"}]';
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async =>
            http.Response(promptResponse, 200, headers: {'content-type': 'application/json'}),
      ),
    );

    await tester.pumpWidget(MaterialApp(home: VideoFeedScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('What is your simple pleasure?'), findsOneWidget);
  });

  testWidgets('liking a card records a swipe and shows a match banner', (tester) async {
    http.Request? capturedRequest;
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/video-feed') {
          return http.Response(_feedResponse, 200, headers: {'content-type': 'application/json'});
        }
        capturedRequest = request;
        return http.Response(
          '{"matched":true,"matchId":"match-1"}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: VideoFeedScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.favorite));
    await tester.pumpAndSettle();

    expect(capturedRequest, isNotNull);
    expect(capturedRequest!.body, '{"targetUserId":"user-2","action":"LIKE"}');
    expect(find.text("It's a match with Jane!"), findsOneWidget);
    expect(find.text('No video profiles nearby right now.'), findsOneWidget);
  });

  testWidgets('passing a card removes it without a match banner', (tester) async {
    http.Request? capturedRequest;
    final api = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/discovery/video-feed') {
          return http.Response(_feedResponse, 200, headers: {'content-type': 'application/json'});
        }
        capturedRequest = request;
        return http.Response('{"matched":false}', 200, headers: {'content-type': 'application/json'});
      }),
    );

    await tester.pumpWidget(MaterialApp(home: VideoFeedScreen(discoveryApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.close));
    await tester.pumpAndSettle();

    expect(capturedRequest, isNotNull);
    expect(capturedRequest!.body, '{"targetUserId":"user-2","action":"PASS"}');
    expect(find.textContaining('match'), findsNothing);
    expect(find.text('No video profiles nearby right now.'), findsOneWidget);
  });
}
