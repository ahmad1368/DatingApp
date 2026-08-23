import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/personality/topic_quiz_api.dart';
import 'package:mobile/personality/topic_quiz_screen.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

void main() {
  testWidgets('answering every question and submitting shows a confirmation', (tester) async {
    http.Request? submitRequest;
    final api = TopicQuizApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'POST') {
          submitRequest = request;
          return _jsonResponse('{"responses":{},"completedAt":"2026-01-01T00:00:00.000Z"}', 200);
        }
        return _jsonResponse(
          '[{"id":"climate-policy","category":"Political","statement":"Statement one."},'
          '{"id":"astrology-belief","category":"Cultural","statement":"Statement two."}]',
          200,
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: TopicQuizScreen(topicQuizApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Agree').first);
    await tester.pump();
    await tester.tap(find.text('Disagree').last);
    await tester.pump();

    await tester.tap(find.text('Submit'));
    await tester.pumpAndSettle();

    expect(submitRequest, isNotNull);
    expect(find.text('Thanks! Your answers are saved.'), findsOneWidget);
  });

  testWidgets('submitting without answering every question shows an error', (tester) async {
    final api = TopicQuizApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => _jsonResponse(
          '[{"id":"climate-policy","category":"Political","statement":"Statement one."}]',
          200,
        ),
      ),
    );

    await tester.pumpWidget(MaterialApp(home: TopicQuizScreen(topicQuizApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Submit'));
    await tester.pumpAndSettle();

    expect(find.text('Please answer every topic before submitting.'), findsOneWidget);
  });
}
