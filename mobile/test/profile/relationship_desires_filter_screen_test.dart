import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/profile/lifestyle_filters_api.dart';
import 'package:mobile/profile/relationship_desires_filter_screen.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

String _fullFiltersJson({String relationshipDesires = '[]'}) => '''
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
  "filterRelationshipDesires": $relationshipDesires,
  "filterPetOwnership": [],
  "filterPetAllergyStatus": [],
  "filterBoundaryTags": [],
  "filterPoliticalOrientations": [],
  "filterSharedInterestsOnly": false,
  "filterVerifiedOnly": false,
  "filterCommunityGroups": []
}
''';

void main() {
  testWidgets('shows the catalog with the current selection pre-checked', (tester) async {
    final api = LifestyleFiltersApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile/lifestyle/catalog') {
          return _jsonResponse(
            '{"relationshipDesires":["Casual Dating","Long-Term Relationship","Marriage"]}',
            200,
          );
        }
        return _jsonResponse(_fullFiltersJson(relationshipDesires: '["Marriage"]'), 200);
      }),
    );

    await tester.pumpWidget(
      MaterialApp(home: RelationshipDesiresFilterScreen(lifestyleFiltersApi: api)),
    );
    await tester.pumpAndSettle();

    expect(find.text('Marriage'), findsOneWidget);
    final chip = tester.widget<FilterChip>(
      find.ancestor(of: find.text('Marriage'), matching: find.byType(FilterChip)),
    );
    expect(chip.selected, isTrue);
  });

  testWidgets('selecting a desire and saving sends the updated filter list', (tester) async {
    http.Request? putRequest;
    final api = LifestyleFiltersApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile/lifestyle/catalog') {
          return _jsonResponse('{"relationshipDesires":["Casual Dating","Marriage"]}', 200);
        }
        if (request.method == 'PUT') {
          putRequest = request;
          return _jsonResponse(_fullFiltersJson(relationshipDesires: '["Casual Dating"]'), 200);
        }
        return _jsonResponse(_fullFiltersJson(), 200);
      }),
    );

    await tester.pumpWidget(
      MaterialApp(home: RelationshipDesiresFilterScreen(lifestyleFiltersApi: api)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Casual Dating'));
    await tester.pump();
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    expect(putRequest, isNotNull);
    expect(putRequest!.body, contains('"filterRelationshipDesires":["Casual Dating"]'));
  });
}
