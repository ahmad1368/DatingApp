import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/community_groups/community_groups_api.dart';
import 'package:mobile/profile/community_group_filter_screen.dart';
import 'package:mobile/profile/lifestyle_filters_api.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

const _catalogResponse = '[{"id":"book-lovers","name":"Book Lovers","description":"Bookworms."},'
    '{"id":"foodies","name":"Foodies","description":"All things food."}]';

String _fullFiltersJson({String communityGroups = '[]'}) => '''
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
  "filterSharedInterestsOnly": false,
  "filterVerifiedOnly": false,
  "filterCommunityGroups": $communityGroups
}
''';

void main() {
  testWidgets('shows the catalog with the current selection pre-checked', (tester) async {
    final communityGroupsApi = CommunityGroupsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async => _jsonResponse(_catalogResponse, 200)),
    );
    final lifestyleFiltersApi = LifestyleFiltersApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => _jsonResponse(_fullFiltersJson(communityGroups: '["book-lovers"]'), 200),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: CommunityGroupFilterScreen(
          communityGroupsApi: communityGroupsApi,
          lifestyleFiltersApi: lifestyleFiltersApi,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Book Lovers'), findsOneWidget);
    final chip = tester.widget<FilterChip>(
      find.ancestor(of: find.text('Book Lovers'), matching: find.byType(FilterChip)),
    );
    expect(chip.selected, isTrue);
  });

  testWidgets('selecting a group and saving sends the updated filter list', (tester) async {
    http.Request? putRequest;
    final communityGroupsApi = CommunityGroupsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async => _jsonResponse(_catalogResponse, 200)),
    );
    final lifestyleFiltersApi = LifestyleFiltersApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'PUT') {
          putRequest = request;
          return _jsonResponse(_fullFiltersJson(communityGroups: '["foodies"]'), 200);
        }
        return _jsonResponse(_fullFiltersJson(), 200);
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: CommunityGroupFilterScreen(
          communityGroupsApi: communityGroupsApi,
          lifestyleFiltersApi: lifestyleFiltersApi,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Foodies'));
    await tester.pump();
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    expect(putRequest, isNotNull);
    expect(putRequest!.body, contains('"filterCommunityGroups":["foodies"]'));
  });
}
