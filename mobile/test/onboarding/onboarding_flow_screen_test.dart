import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/onboarding/onboarding_api.dart';
import 'package:mobile/onboarding/onboarding_flow_screen.dart';

void main() {
  testWidgets('walks through all steps and submits onboarding data', (tester) async {
    http.Request? capturedRequest;
    final api = OnboardingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        capturedRequest = request;
        return http.Response(
          '{"id":"user-1","name":null,"dateOfBirth":"2000-01-01T00:00:00.000Z",'
          '"relationshipGoal":"CASUAL","interests":["Hiking"]}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    OnboardingResult? completedResult;
    await tester.pumpWidget(
      MaterialApp(
        home: OnboardingFlowScreen(
          onboardingApi: api,
          onCompleted: (result) => completedResult = result,
        ),
      ),
    );

    // Step 1: basic info — Next is disabled until a date of birth is picked.
    expect(find.text('Select date of birth'), findsOneWidget);
    final nextButtonFinder = find.widgetWithText(ElevatedButton, 'Next');
    expect(tester.widget<ElevatedButton>(nextButtonFinder).onPressed, isNull);

    await tester.tap(find.text('Select date of birth'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Next'));
    await tester.pumpAndSettle();

    // Step 2: relationship goal.
    expect(find.text('What are you looking for?'), findsOneWidget);
    await tester.tap(find.text('Something casual'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ElevatedButton, 'Next'));
    await tester.pumpAndSettle();

    // Step 3: interests.
    expect(find.text('Pick a few interests (up to 10)'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilterChip, 'Hiking'));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Finish'));
    await tester.pumpAndSettle();

    expect(capturedRequest, isNotNull);
    expect(capturedRequest!.url.path, '/onboarding');
    expect(completedResult, isNotNull);
    expect(completedResult!.relationshipGoal, 'CASUAL');
  });
}
