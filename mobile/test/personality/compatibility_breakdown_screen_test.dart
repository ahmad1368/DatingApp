import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/personality/compatibility_breakdown_screen.dart';
import 'package:mobile/personality/personality_api.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

void main() {
  testWidgets('shows the overall percentage and per-category breakdown', (tester) async {
    final api = PersonalityApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => _jsonResponse(
          '{"percentage":90,"sharedDimensionCount":2,"categories":[{"category":"Emotional Values",'
          '"averageSimilarity":90,"dimensions":[{"dimension":"Optimism","myScore":80,'
          '"theirScore":100,"similarity":80}]}]}',
          200,
        ),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: CompatibilityBreakdownScreen(personalityApi: api, otherUserId: 'user-2'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Overall compatibility: 90%'), findsOneWidget);
    expect(find.text('Emotional Values · 90% match'), findsOneWidget);
    expect(find.text('Optimism'), findsOneWidget);
  });

  testWidgets('shows a prompt when the compatibility percentage is unavailable', (tester) async {
    final api = PersonalityApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async =>
            _jsonResponse('{"percentage":null,"sharedDimensionCount":0,"categories":[]}', 200),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: CompatibilityBreakdownScreen(personalityApi: api, otherUserId: 'user-2'),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('Take the personality test to see a compatibility breakdown.'),
      findsOneWidget,
    );
  });

  testWidgets('shows an error message on failure', (tester) async {
    final api = PersonalityApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => _jsonResponse('{"message":"User not found."}', 404),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: CompatibilityBreakdownScreen(personalityApi: api, otherUserId: 'user-2'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('User not found.'), findsOneWidget);
  });
}
