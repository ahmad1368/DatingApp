import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/profile/lifestyle_filters_api.dart';
import 'package:mobile/profile/relationship_goal_filter_screen.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

String _fullFiltersJson({String relationshipGoals = '[]'}) => '''
{
  "smokingHabit": null,
  "drinkingHabit": null,
  "education": null,
  "religion": null,
  "dietaryPreference": null,
  "wantsChildren": null,
  "heightCm": null,
  "workoutHabit": null,
  "petOwnership": null,
  "showLifestyleBadgesOnProfile": true,
  "filterSmokingHabits": [],
  "filterDrinkingHabits": [],
  "filterEducationLevels": [],
  "filterReligions": [],
  "filterDietaryPreferences": [],
  "filterWantsChildren": [],
  "filterRelationshipGoals": $relationshipGoals,
  "filterKinkTags": [],
  "filterRelationshipDesires": [],
  "filterSharedInterestsOnly": false,
  "filterVerifiedOnly": false
}
''';

void main() {
  testWidgets('shows the catalog with the current selection pre-checked', (tester) async {
    final api = LifestyleFiltersApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile/lifestyle/catalog') {
          return _jsonResponse('{"relationshipGoals":["LONG_TERM","CASUAL","FRIENDSHIP","NOT_SURE"]}', 200);
        }
        return _jsonResponse(_fullFiltersJson(relationshipGoals: '["LONG_TERM"]'), 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: RelationshipGoalFilterScreen(lifestyleFiltersApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Long-term relationship'), findsOneWidget);
    final chip = tester.widget<FilterChip>(
      find.ancestor(of: find.text('Long-term relationship'), matching: find.byType(FilterChip)),
    );
    expect(chip.selected, isTrue);
  });

  testWidgets('selecting a goal and saving sends the updated filter list', (tester) async {
    http.Request? putRequest;
    final api = LifestyleFiltersApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile/lifestyle/catalog') {
          return _jsonResponse('{"relationshipGoals":["LONG_TERM","CASUAL"]}', 200);
        }
        if (request.method == 'PUT') {
          putRequest = request;
          return _jsonResponse(_fullFiltersJson(relationshipGoals: '["CASUAL"]'), 200);
        }
        return _jsonResponse(_fullFiltersJson(), 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: RelationshipGoalFilterScreen(lifestyleFiltersApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Something casual'));
    await tester.pump();
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    expect(putRequest, isNotNull);
    expect(putRequest!.body, contains('"filterRelationshipGoals":["CASUAL"]'));
  });
}
