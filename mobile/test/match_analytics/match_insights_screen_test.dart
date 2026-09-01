import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/match_analytics/match_analytics_api.dart';
import 'package:mobile/match_analytics/match_insights_screen.dart';

void main() {
  testWidgets('shows the fetched insights', (tester) async {
    final api = MatchAnalyticsApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response(
          '{"totalLikesSent":10,"totalMatches":3,"likeAcceptanceRate":0.3,'
          '"averageMessageInitiationSeconds":180}',
          200,
          headers: {'content-type': 'application/json'},
        ),
      ),
    );

    await tester.pumpWidget(MaterialApp(home: MatchInsightsScreen(matchAnalyticsApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('10'), findsOneWidget);
    expect(find.text('3'), findsOneWidget);
    expect(find.text('30%'), findsOneWidget);
    expect(find.text('3 min'), findsOneWidget);
  });

  testWidgets('shows a placeholder when there is not enough data yet', (tester) async {
    final api = MatchAnalyticsApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response(
          '{"totalLikesSent":0,"totalMatches":0,"likeAcceptanceRate":null,'
          '"averageMessageInitiationSeconds":null}',
          200,
          headers: {'content-type': 'application/json'},
        ),
      ),
    );

    await tester.pumpWidget(MaterialApp(home: MatchInsightsScreen(matchAnalyticsApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Not enough data yet'), findsNWidgets(2));
  });

  testWidgets('shows an error when fetching insights fails', (tester) async {
    final api = MatchAnalyticsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async => http.Response('{"message":"boom"}', 500)),
    );

    await tester.pumpWidget(MaterialApp(home: MatchInsightsScreen(matchAnalyticsApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('boom'), findsOneWidget);
  });
}
