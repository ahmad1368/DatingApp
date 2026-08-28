import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/personality/compatibility_report_screen.dart';
import 'package:mobile/personality/personality_api.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

void main() {
  testWidgets('shows the overall percentage and first section, paging to the next', (
    tester,
  ) async {
    final api = PersonalityApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => _jsonResponse(
          '{"percentage":85,"sharedDimensionCount":2,"sections":['
          '{"title":"Communication Strengths","score":70,"insight":"Generally compatible.",'
          '"dimensions":[{"dimension":"Directness","myScore":40,"theirScore":100,"similarity":40}]},'
          '{"title":"Emotional Compatibility","score":80,"insight":"Strongly aligned.",'
          '"dimensions":[{"dimension":"Optimism","myScore":80,"theirScore":100,"similarity":80}]}'
          ']}',
          200,
        ),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: CompatibilityReportScreen(personalityApi: api, otherUserId: 'user-2'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Overall compatibility: 85%'), findsOneWidget);
    expect(find.text('Communication Strengths'), findsOneWidget);
    expect(find.text('70% match'), findsOneWidget);
    expect(find.text('Directness'), findsOneWidget);
    expect(find.text('Emotional Compatibility'), findsNothing);

    await tester.fling(find.byType(PageView), const Offset(-400, 0), 1000);
    await tester.pumpAndSettle();

    expect(find.text('Emotional Compatibility'), findsOneWidget);
    expect(find.text('80% match'), findsOneWidget);
  });

  testWidgets('shows a message when there is not enough shared data', (tester) async {
    final api = PersonalityApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => _jsonResponse(
          '{"percentage":null,"sharedDimensionCount":0,"sections":[]}',
          200,
        ),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: CompatibilityReportScreen(personalityApi: api, otherUserId: 'user-2'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Not enough shared data yet to build a report.'), findsOneWidget);
  });

  testWidgets('shows an error message when the request fails', (tester) async {
    final api = PersonalityApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async => _jsonResponse('{"message":"Not found"}', 404)),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: CompatibilityReportScreen(personalityApi: api, otherUserId: 'user-2'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Not found'), findsOneWidget);
  });
}
