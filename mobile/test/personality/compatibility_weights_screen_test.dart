import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/personality/compatibility_weights_screen.dart';
import 'package:mobile/personality/personality_api.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

const _defaultWeights =
    '{"Emotional Values":1,"Core Values":1,"Communication Style":1,"Social Habits":1}';

void main() {
  testWidgets('loads and shows the current weights', (tester) async {
    final api = PersonalityApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async => _jsonResponse(_defaultWeights, 200)),
    );

    await tester.pumpWidget(MaterialApp(home: CompatibilityWeightsScreen(personalityApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Emotional Values: 1.0x'), findsOneWidget);
    expect(find.text('Core Values: 1.0x'), findsOneWidget);
    expect(find.byType(Slider), findsNWidgets(4));
  });

  testWidgets('dragging a slider and saving persists the updated weight', (tester) async {
    http.Request? putRequest;
    final api = PersonalityApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'POST') {
          putRequest = request;
          return _jsonResponse(
            '{"Emotional Values":1,"Core Values":2,"Communication Style":1,"Social Habits":1}',
            200,
          );
        }
        return _jsonResponse(_defaultWeights, 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: CompatibilityWeightsScreen(personalityApi: api)));
    await tester.pumpAndSettle();

    final coreValuesSlider = find.byWidgetPredicate(
      (widget) => widget is Slider && widget.value == 1.0 && widget.max == 2,
    );
    await tester.drag(coreValuesSlider.at(1), const Offset(500, 0));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    expect(putRequest, isNotNull);
    expect(find.text('Saved.'), findsOneWidget);
    expect(find.text('Core Values: 2.0x'), findsOneWidget);
  });

  testWidgets('shows an error when saving fails', (tester) async {
    final api = PersonalityApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'POST') {
          return _jsonResponse('{"message":"boom"}', 400);
        }
        return _jsonResponse(_defaultWeights, 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: CompatibilityWeightsScreen(personalityApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    expect(find.text('boom'), findsOneWidget);
  });
}
