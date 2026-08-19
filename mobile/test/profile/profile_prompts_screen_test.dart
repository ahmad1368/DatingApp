import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/profile/profile_prompts_api.dart';
import 'package:mobile/profile/profile_prompts_screen.dart';

const _catalogResponse =
    '{"questions":["Q1","Q2","Q3","Q4"]}';

void main() {
  testWidgets('Save is disabled until at least 3 prompts are answered', (tester) async {
    final api = ProfilePromptsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile/prompts/catalog') {
          return http.Response(_catalogResponse, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response('', 500);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: ProfilePromptsScreen(profilePromptsApi: api)));
    await tester.pumpAndSettle();

    final saveButtonFinder = find.widgetWithText(ElevatedButton, 'Save');
    expect(tester.widget<ElevatedButton>(saveButtonFinder).onPressed, isNull);

    // Select and answer only 2 prompts — still not enough.
    await tester.tap(find.widgetWithText(CheckboxListTile, 'Q1'));
    await tester.pump();
    await tester.enterText(find.byType(TextField).first, 'Answer 1');
    await tester.tap(find.widgetWithText(CheckboxListTile, 'Q2'));
    await tester.pump();
    final answerFields = find.byType(TextField);
    await tester.enterText(answerFields.last, 'Answer 2');
    await tester.pump();

    expect(tester.widget<ElevatedButton>(saveButtonFinder).onPressed, isNull);

    // A third answered prompt should enable Save.
    await tester.tap(find.widgetWithText(CheckboxListTile, 'Q3'));
    await tester.pump();
    await tester.enterText(find.byType(TextField).last, 'Answer 3');
    await tester.pump();

    expect(tester.widget<ElevatedButton>(saveButtonFinder).onPressed, isNotNull);
  });

  testWidgets('saving submits the selected prompts and shows a confirmation', (tester) async {
    http.Request? capturedRequest;
    final api = ProfilePromptsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile/prompts/catalog') {
          return http.Response(_catalogResponse, 200, headers: {'content-type': 'application/json'});
        }
        capturedRequest = request;
        return http.Response(
          '[{"question":"Q1","answer":"Answer 1","position":0},'
          '{"question":"Q2","answer":"Answer 2","position":1},'
          '{"question":"Q3","answer":"Answer 3","position":2}]',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(MaterialApp(home: ProfilePromptsScreen(profilePromptsApi: api)));
    await tester.pumpAndSettle();

    for (final question in ['Q1', 'Q2', 'Q3']) {
      await tester.tap(find.widgetWithText(CheckboxListTile, question));
      await tester.pump();
    }
    final answerFields = find.byType(TextField);
    for (var i = 0; i < 3; i++) {
      await tester.enterText(answerFields.at(i), 'Answer ${i + 1}');
      await tester.pump();
    }

    final saveButtonFinder = find.widgetWithText(ElevatedButton, 'Save');
    expect(tester.widget<ElevatedButton>(saveButtonFinder).onPressed, isNotNull);
    await tester.tap(saveButtonFinder);
    await tester.pumpAndSettle();

    expect(capturedRequest, isNotNull);
    expect(capturedRequest!.url.path, '/profile/prompts');
    expect(find.text('Profile prompts saved.'), findsOneWidget);
  });
}
