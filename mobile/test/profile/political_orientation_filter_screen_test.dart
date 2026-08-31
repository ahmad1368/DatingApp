import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/profile/lifestyle_filters_api.dart';
import 'package:mobile/profile/political_orientation_filter_screen.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

String _fullFiltersJson({String politicalOrientations = '[]'}) => '''
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
  "petAllergyStatus": null,
  "politicalOrientation": null,
  "civicActivityLevel": null,
  "showLifestyleBadgesOnProfile": true,
  "filterSmokingHabits": [],
  "filterDrinkingHabits": [],
  "filterEducationLevels": [],
  "filterReligions": [],
  "filterDietaryPreferences": [],
  "filterWantsChildren": [],
  "filterRelationshipGoals": [],
  "filterKinkTags": [],
  "filterRelationshipDesires": [],
  "filterPetOwnership": [],
  "filterPetAllergyStatus": [],
  "filterBoundaryTags": [],
  "filterPoliticalOrientations": $politicalOrientations,
  "filterSharedInterestsOnly": false,
  "filterVerifiedOnly": false,
  "filterCommunityGroups": []
}
''';

const _catalogResponse =
    '{"politicalOrientations":["Progressive","Liberal","Moderate","Conservative","Libertarian","Apolitical","Prefer Not to Say"]}';

void main() {
  testWidgets('shows the catalog with the current selections pre-checked', (tester) async {
    final api = LifestyleFiltersApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile/lifestyle/catalog') {
          return _jsonResponse(_catalogResponse, 200);
        }
        return _jsonResponse(_fullFiltersJson(politicalOrientations: '["Moderate"]'), 200);
      }),
    );

    await tester.pumpWidget(
      MaterialApp(home: PoliticalOrientationFilterScreen(lifestyleFiltersApi: api)),
    );
    await tester.pumpAndSettle();

    final moderateChip = tester.widget<FilterChip>(
      find.ancestor(of: find.text('Moderate'), matching: find.byType(FilterChip)),
    );
    expect(moderateChip.selected, isTrue);

    final progressiveChip = tester.widget<FilterChip>(
      find.ancestor(of: find.text('Progressive'), matching: find.byType(FilterChip)),
    );
    expect(progressiveChip.selected, isFalse);
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
          return _jsonResponse(_fullFiltersJson(politicalOrientations: '["Liberal"]'), 200);
        }
        return _jsonResponse(_fullFiltersJson(), 200);
      }),
    );

    await tester.pumpWidget(
      MaterialApp(home: PoliticalOrientationFilterScreen(lifestyleFiltersApi: api)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Liberal'));
    await tester.pump();
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    expect(putRequest, isNotNull);
    expect(putRequest!.body, contains('"filterPoliticalOrientations":["Liberal"]'));
  });
}
