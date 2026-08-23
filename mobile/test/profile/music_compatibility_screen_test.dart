import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/profile/music_compatibility_screen.dart';
import 'package:mobile/profile/spotify_api.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

void main() {
  testWidgets('shows the match percentage and shared artists', (tester) async {
    final api = SpotifyApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => _jsonResponse('{"percentage":50,"sharedArtists":["Artist Two"]}', 200),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(home: MusicCompatibilityScreen(spotifyApi: api, otherUserId: 'user-2')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Music match: 50%'), findsOneWidget);
    expect(find.text('Artist Two'), findsOneWidget);
  });

  testWidgets('shows a prompt when the percentage is unavailable', (tester) async {
    final api = SpotifyApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => _jsonResponse('{"percentage":null,"sharedArtists":[]}', 200),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(home: MusicCompatibilityScreen(spotifyApi: api, otherUserId: 'user-2')),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('Connect Spotify to see your music match with this person.'),
      findsOneWidget,
    );
  });

  testWidgets('shows an error message on failure', (tester) async {
    final api = SpotifyApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => _jsonResponse('{"message":"User not found."}', 404),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(home: MusicCompatibilityScreen(spotifyApi: api, otherUserId: 'user-2')),
    );
    await tester.pumpAndSettle();

    expect(find.text('User not found.'), findsOneWidget);
  });
}
