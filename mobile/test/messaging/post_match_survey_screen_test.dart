import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/messaging/post_match_survey_api.dart';
import 'package:mobile/messaging/post_match_survey_screen.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

void main() {
  testWidgets('submitting "yes" requires a quality pick before enabling submit', (tester) async {
    http.Request? putRequest;
    final api = PostMatchSurveyApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'GET') {
          return _jsonResponse('null', 200);
        }
        putRequest = request;
        return _jsonResponse(
          '{"matchId":"match-1","metInPerson":true,"matchQuality":"GREAT",'
          '"createdAt":"2026-01-01T00:00:00.000Z"}',
          200,
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(home: PostMatchSurveyScreen(postMatchSurveyApi: api, matchId: 'match-1')),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Yes'));
    await tester.pump();

    expect(
      tester.widget<ElevatedButton>(find.widgetWithText(ElevatedButton, 'Submit')).onPressed,
      isNull,
    );

    await tester.tap(find.text('Great'));
    await tester.pump();
    await tester.tap(find.widgetWithText(ElevatedButton, 'Submit'));
    await tester.pumpAndSettle();

    expect(putRequest, isNotNull);
    expect(putRequest!.body, '{"metInPerson":true,"matchQuality":"GREAT"}');
    expect(find.text('Thanks for the feedback!'), findsOneWidget);
  });

  testWidgets('submitting "no" does not require a quality pick', (tester) async {
    http.Request? putRequest;
    final api = PostMatchSurveyApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'GET') {
          return _jsonResponse('null', 200);
        }
        putRequest = request;
        return _jsonResponse(
          '{"matchId":"match-1","metInPerson":false,"matchQuality":null,'
          '"createdAt":"2026-01-01T00:00:00.000Z"}',
          200,
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(home: PostMatchSurveyScreen(postMatchSurveyApi: api, matchId: 'match-1')),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('No'));
    await tester.pump();
    await tester.tap(find.widgetWithText(ElevatedButton, 'Submit'));
    await tester.pumpAndSettle();

    expect(putRequest, isNotNull);
    expect(putRequest!.body, '{"metInPerson":false}');
  });

  testWidgets('pre-fills the form from an existing survey', (tester) async {
    final api = PostMatchSurveyApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => _jsonResponse(
          '{"matchId":"match-1","metInPerson":true,"matchQuality":"OK",'
          '"createdAt":"2026-01-01T00:00:00.000Z"}',
          200,
        ),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(home: PostMatchSurveyScreen(postMatchSurveyApi: api, matchId: 'match-1')),
    );
    await tester.pumpAndSettle();

    expect(
      tester.widget<RadioListTile<bool>>(find.widgetWithText(RadioListTile<bool>, 'Yes')).groupValue,
      isTrue,
    );
    expect(
      tester
          .widget<RadioListTile<String>>(find.widgetWithText(RadioListTile<String>, 'It was OK'))
          .groupValue,
      'OK',
    );
  });
}
