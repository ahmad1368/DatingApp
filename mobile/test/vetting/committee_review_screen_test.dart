import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/vetting/committee_review_screen.dart';
import 'package:mobile/vetting/vetting_api.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

void main() {
  testWidgets('shows an empty state when there is nothing to review', (tester) async {
    final api = VettingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async => _jsonResponse('[]', 200)),
    );

    await tester.pumpWidget(MaterialApp(home: CommitteeReviewScreen(vettingApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('No pending applications.'), findsOneWidget);
  });

  testWidgets('lists queued applications and approves one on tap', (tester) async {
    http.Request? decideRequest;
    final api = VettingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'POST' && request.url.path.endsWith('/decide')) {
          decideRequest = request;
          return _jsonResponse(
            '{"id":"app-1","userId":"user-1","status":"APPROVED","referralCount":2,'
            '"socialLinks":[],"decisionReason":null,"createdAt":"2026-01-01T00:00:00.000Z",'
            '"decidedAt":"2026-01-02T00:00:00.000Z"}',
            200,
          );
        }
        return _jsonResponse(
          '[{"id":"app-1","referralCount":2,"socialLinks":["https://instagram.com/a"],'
          '"createdAt":"2026-01-01T00:00:00.000Z"}]',
          200,
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: CommitteeReviewScreen(vettingApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('2 peer referral(s)'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.check));
    await tester.pumpAndSettle();

    expect(decideRequest, isNotNull);
    expect(decideRequest!.url.path, '/vetting/applications/app-1/decide');
    expect(decideRequest!.body, '{"decision":"APPROVED"}');
    expect(find.text('No pending applications.'), findsOneWidget);
  });

  testWidgets('rejecting prompts for a reason and sends it', (tester) async {
    http.Request? decideRequest;
    final api = VettingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'POST' && request.url.path.endsWith('/decide')) {
          decideRequest = request;
          return _jsonResponse(
            '{"id":"app-1","userId":"user-1","status":"REJECTED","referralCount":0,'
            '"socialLinks":[],"decisionReason":"Not a fit","createdAt":"2026-01-01T00:00:00.000Z",'
            '"decidedAt":"2026-01-02T00:00:00.000Z"}',
            200,
          );
        }
        return _jsonResponse(
          '[{"id":"app-1","referralCount":0,"socialLinks":[],'
          '"createdAt":"2026-01-01T00:00:00.000Z"}]',
          200,
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: CommitteeReviewScreen(vettingApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.close));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'Not a fit');
    await tester.tap(find.text('Reject'));
    await tester.pumpAndSettle();

    expect(decideRequest, isNotNull);
    expect(decideRequest!.body, '{"decision":"REJECTED","reason":"Not a fit"}');
  });

  testWidgets('shows an error message when the caller is not on the committee', (tester) async {
    final api = VettingApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async =>
            _jsonResponse('{"message":"Only committee members can perform this action."}', 403),
      ),
    );

    await tester.pumpWidget(MaterialApp(home: CommitteeReviewScreen(vettingApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Only committee members can perform this action.'), findsOneWidget);
  });
}
