import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/profile/lifestyle_filters_api.dart';
import 'package:mobile/profile/religious_practice_level_filter_screen.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

String _fullFiltersJson({String religiousPracticeLevels = '[]'}) => '''
{
  "smokingHabit": null,
  "drinkingHabit": null,
  "education": null,
  "religion": null,
  "religiousPracticeLevel": null,
  "dietaryPreference": null,
  "wantsChildren": null,
  "heightCm": null,
  "workoutHabit": null,
  "petOwnership": null,
  "petAllergyStatus": null,
  "politicalOrientation": null,
  "civicActivityLevel": null,
  "showLifestyleBadgesOnProfile": true,
  "filterSmokingHabits": [],
  "filterDrinkingHabits": [],
  "filterWorkoutHabits": [],
  "filterEducationLevels": [],
  "filterReligions": [],
  "filterReligiousPracticeLevels": $religiousPracticeLevels,
  "filterDietaryPreferences": [],
  "filterWantsChildren": [],
  "filterRelationshipGoals": [],
  "filterKinkTags": [],
  "filterRelationshipDesires": [],
  "filterPetOwnership": [],
  "filterPetAllergyStatus": [],
  "filterBoundaryTags": [],
  "filterPoliticalOrientations": [],
  "filterSharedInterestsOnly": false,
  "filterVerifiedOnly": false,
  "filterCommunityGroups": [],
  "filterSameCampusOnly": false
}
''';

const _catalogResponse =
    '{"religiousPracticeLevels":["Not Practicing","Culturally Only","Somewhat Practicing","Very Practicing","Prefer Not to Say"]}';

void main() {
  testWidgets('shows the catalog with the current selections pre-checked', (tester) async {
    final api = LifestyleFiltersApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile/lifestyle/catalog') {
          return _jsonResponse(_catalogResponse, 200);
        }
        return _jsonResponse(_fullFiltersJson(religiousPracticeLevels: '["Very Practicing"]'), 200);
      }),
    );

    await tester.pumpWidget(
      MaterialApp(home: ReligiousPracticeLevelFilterScreen(lifestyleFiltersApi: api)),
    );
    await tester.pumpAndSettle();

    final practicingChip = tester.widget<FilterChip>(
      find.ancestor(of: find.text('Very Practicing'), matching: find.byType(FilterChip)),
    );
    expect(practicingChip.selected, isTrue);

    final notPracticingChip = tester.widget<FilterChip>(
      find.ancestor(of: find.text('Not Practicing'), matching: find.byType(FilterChip)),
    );
    expect(notPracticingChip.selected, isFalse);
  });

  testWidgets('selecting options and saving sends the updated filter list', (tester) async {
    http.Request? putRequest;
    final api = LifestyleFiltersApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile/lifestyle/catalog') {
          return _jsonResponse(_catalogResponse, 200);
        }
        if (request.method == 'PUT') {
          putRequest = request;
          return _jsonResponse(
            _fullFiltersJson(religiousPracticeLevels: '["Somewhat Practicing"]'),
            200,
          );
        }
        return _jsonResponse(_fullFiltersJson(), 200);
      }),
    );

    await tester.pumpWidget(
      MaterialApp(home: ReligiousPracticeLevelFilterScreen(lifestyleFiltersApi: api)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Somewhat Practicing'));
    await tester.pump();
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    expect(putRequest, isNotNull);
    expect(putRequest!.body, contains('"filterReligiousPracticeLevels":["Somewhat Practicing"]'));
  });
}
