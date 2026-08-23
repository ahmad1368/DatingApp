import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/personality/topic_alignment_screen.dart';
import 'package:mobile/personality/topic_quiz_api.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

void main() {
  testWidgets('shows the overall percentage and per-topic agreement indicators', (tester) async {
    final api = TopicQuizApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => _jsonResponse(
          '{"alignmentPercentage":50,"sharedTopicCount":1,"items":[{"questionId":"climate-policy",'
          '"category":"Political","statement":"Government should fight climate change.",'
          '"myStance":"AGREE","theirStance":"DISAGREE","agreement":"DISAGREE"}]}',
          200,
        ),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(home: TopicAlignmentScreen(topicQuizApi: api, otherUserId: 'user-2')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Overall alignment: 50%'), findsOneWidget);
    expect(find.text('Government should fight climate change.'), findsOneWidget);
    expect(find.text('You: AGREE · Them: DISAGREE'), findsOneWidget);
  });

  testWidgets('shows a prompt when the alignment percentage is unavailable', (tester) async {
    final api = TopicQuizApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async =>
            _jsonResponse('{"alignmentPercentage":null,"sharedTopicCount":0,"items":[]}', 200),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(home: TopicAlignmentScreen(topicQuizApi: api, otherUserId: 'user-2')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Take the topic quiz to see your alignment.'), findsOneWidget);
  });

  testWidgets('shows an error message on failure', (tester) async {
    final api = TopicQuizApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => _jsonResponse('{"message":"User not found."}', 404),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(home: TopicAlignmentScreen(topicQuizApi: api, otherUserId: 'user-2')),
    );
    await tester.pumpAndSettle();

    expect(find.text('User not found.'), findsOneWidget);
  });
}
