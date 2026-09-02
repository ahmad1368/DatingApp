import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/profile/habit_filters_screen.dart';
import 'package:mobile/profile/lifestyle_filters_api.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

String _fullFiltersJson({
  String smokingHabits = '[]',
  String drinkingHabits = '[]',
  String workoutHabits = '[]',
}) =>
    '''
{
  "showLifestyleBadgesOnProfile": true,
  "filterSmokingHabits": $smokingHabits,
  "filterDrinkingHabits": $drinkingHabits,
  "filterWorkoutHabits": $workoutHabits,
  "filterEducationLevels": [],
  "filterReligions": [],
  "filterReligiousPracticeLevels": [],
  "filterDietaryPreferences": [],
  "filterWantsChildren": [],
  "filterRelationshipGoals": [],
  "filterKinkTags": [],
  "filterRelationshipDesires": [],
  "filterBoundaryTags": [],
  "filterPetOwnership": [],
  "filterPetAllergyStatus": [],
  "filterPoliticalOrientations": [],
  "filterSharedInterestsOnly": false,
  "filterVerifiedOnly": false,
  "filterCommunityGroups": [],
  "filterSameCampusOnly": false
}
''';

const _catalogResponse = '{"smokingHabits":["Smoking: Never","Smoking: Occasionally"],'
    '"drinkingHabits":["Drinking: Never","Drinking: Socially"],'
    '"workoutHabits":["Workout: Never","Workout: Daily"]}';

void main() {
  testWidgets('shows all three catalogs with the current selections pre-checked', (tester) async {
    final api = LifestyleFiltersApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile/lifestyle/catalog') {
          return _jsonResponse(_catalogResponse, 200);
        }
        return _jsonResponse(
          _fullFiltersJson(
            smokingHabits: '["Smoking: Never"]',
            drinkingHabits: '["Drinking: Socially"]',
            workoutHabits: '["Workout: Daily"]',
          ),
          200,
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: HabitFiltersScreen(lifestyleFiltersApi: api)));
    await tester.pumpAndSettle();

    final smokingChip = tester.widget<FilterChip>(
      find.ancestor(of: find.text('Smoking: Never'), matching: find.byType(FilterChip)),
    );
    expect(smokingChip.selected, isTrue);

    final drinkingChip = tester.widget<FilterChip>(
      find.ancestor(of: find.text('Drinking: Socially'), matching: find.byType(FilterChip)),
    );
    expect(drinkingChip.selected, isTrue);

    final workoutChip = tester.widget<FilterChip>(
      find.ancestor(of: find.text('Workout: Daily'), matching: find.byType(FilterChip)),
    );
    expect(workoutChip.selected, isTrue);
  });

  testWidgets('selecting options and saving sends all three updated filter lists', (tester) async {
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
            _fullFiltersJson(
              smokingHabits: '["Smoking: Never"]',
              drinkingHabits: '["Drinking: Never"]',
              workoutHabits: '["Workout: Daily"]',
            ),
            200,
          );
        }
        return _jsonResponse(_fullFiltersJson(), 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: HabitFiltersScreen(lifestyleFiltersApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Smoking: Never'));
    await tester.pump();
    await tester.tap(find.text('Drinking: Never'));
    await tester.pump();
    await tester.tap(find.text('Workout: Daily'));
    await tester.pump();
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    expect(putRequest, isNotNull);
    expect(putRequest!.body, contains('"filterSmokingHabits":["Smoking: Never"]'));
    expect(putRequest!.body, contains('"filterWorkoutHabits":["Workout: Daily"]'));
  });
}
