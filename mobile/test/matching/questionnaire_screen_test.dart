import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/matching/matching_api.dart';
import 'package:mobile/matching/questionnaire_screen.dart';

const _questionsResponse = '[{"id":"q1","text":"Do you want kids?","options":["Yes","No"]},'
    '{"id":"q2","text":"City or countryside?","options":["City","Countryside"]}]';

void main() {
  testWidgets('shows a completion message when there are no questions', (tester) async {
    final api = MatchingApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response('[]', 200, headers: {'content-type': 'application/json'}),
      ),
    );

    await tester.pumpWidget(MaterialApp(home: QuestionnaireScreen(matchingApi: api)));
    await tester.pumpAndSettle();

    expect(find.text("You're all caught up!"), findsOneWidget);
  });

  testWidgets('answering a question submits it and advances to the next one', (tester) async {
    http.Request? submitRequest;
    final api = MatchingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/questionnaire/questions') {
          return http.Response(
            _questionsResponse,
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        submitRequest = request;
        return http.Response(
          '{"questionId":"q1","answer":"Yes","acceptableAnswers":["Yes"],"importance":"MANDATORY"}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: QuestionnaireScreen(matchingApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Question 1 of 2'), findsOneWidget);
    expect(find.text('Do you want kids?'), findsOneWidget);

    await tester.tap(find.widgetWithText(RadioListTile<String>, 'Yes'));
    await tester.pump();
    await tester.tap(find.widgetWithText(FilterChip, 'Yes'));
    await tester.pump();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Save & Next'));
    await tester.pumpAndSettle();

    expect(submitRequest, isNotNull);
    expect(
      submitRequest!.body,
      '{"questionId":"q1","answer":"Yes","acceptableAnswers":["Yes"],"importance":"SOMEWHAT_IMPORTANT"}',
    );
    expect(find.text('Question 2 of 2'), findsOneWidget);
    expect(find.text('City or countryside?'), findsOneWidget);
  });

  testWidgets('shows a completion message after answering the last question', (tester) async {
    final api = MatchingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/questionnaire/questions') {
          return http.Response(
            '[{"id":"q1","text":"Do you want kids?","options":["Yes","No"]}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"questionId":"q1","answer":"Yes","acceptableAnswers":["Yes"],"importance":"SOMEWHAT_IMPORTANT"}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: QuestionnaireScreen(matchingApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(RadioListTile<String>, 'Yes'));
    await tester.pump();
    await tester.tap(find.widgetWithText(ElevatedButton, 'Finish'));
    await tester.pumpAndSettle();

    expect(find.text("You're all caught up!"), findsOneWidget);
  });
}
