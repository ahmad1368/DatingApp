import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/matching/astrology_compatibility_screen.dart';
import 'package:mobile/matching/matching_api.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

void main() {
  testWidgets('shows both signs, elements, the score, and the harmony label', (tester) async {
    final api = MatchingApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => _jsonResponse(
          '{"percentage":80,"sharedQuestionCount":2,"zodiacSign":"Leo","otherZodiacSign":"Aries",'
          '"zodiacHarmony":"Highly Compatible","zodiacElement":"Fire","otherZodiacElement":"Fire",'
          '"zodiacCompatibilityScore":90}',
          200,
        ),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: AstrologyCompatibilityScreen(matchingApi: api, otherUserId: 'user-2'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Leo'), findsOneWidget);
    expect(find.text('Aries'), findsOneWidget);
    expect(find.text('Fire'), findsNWidgets(2));
    expect(find.text('90% astrological match'), findsOneWidget);
    expect(find.text('Highly Compatible'), findsOneWidget);
  });

  testWidgets('prompts to add a birthday when zodiac signs are unavailable', (tester) async {
    final api = MatchingApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => _jsonResponse(
          '{"percentage":null,"sharedQuestionCount":0,"zodiacSign":null,"otherZodiacSign":null,'
          '"zodiacHarmony":null,"zodiacElement":null,"otherZodiacElement":null,'
          '"zodiacCompatibilityScore":null}',
          200,
        ),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: AstrologyCompatibilityScreen(matchingApi: api, otherUserId: 'user-2'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Add your birthday to see astrology compatibility.'), findsOneWidget);
  });

  testWidgets('shows an error message when the request fails', (tester) async {
    final api = MatchingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async => http.Response('{"message":"Not found"}', 404)),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: AstrologyCompatibilityScreen(matchingApi: api, otherUserId: 'user-2'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Not found'), findsOneWidget);
  });
}
