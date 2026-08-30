import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/profile/lifestyle_filters_api.dart';
import 'package:mobile/profile/pet_compatibility_filter_screen.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

String _fullFiltersJson({String petOwnership = '[]', String petAllergyStatus = '[]'}) => '''
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
  "filterPetOwnership": $petOwnership,
  "filterPetAllergyStatus": $petAllergyStatus,
  "filterPoliticalOrientations": [],
  "filterSharedInterestsOnly": false,
  "filterVerifiedOnly": false,
  "filterCommunityGroups": []
}
''';

const _catalogResponse = '{"petOwnershipOptions":["No Pets","Dog","Cat"],'
    '"petAllergyStatusOptions":["Allergy Free","Has Pet Allergies"]}';

void main() {
  testWidgets('shows both catalogs with the current selections pre-checked', (tester) async {
    final api = LifestyleFiltersApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile/lifestyle/catalog') {
          return _jsonResponse(_catalogResponse, 200);
        }
        return _jsonResponse(
          _fullFiltersJson(petOwnership: '["Dog"]', petAllergyStatus: '["Allergy Free"]'),
          200,
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(home: PetCompatibilityFilterScreen(lifestyleFiltersApi: api)),
    );
    await tester.pumpAndSettle();

    final dogChip = tester.widget<FilterChip>(
      find.ancestor(of: find.text('Dog'), matching: find.byType(FilterChip)),
    );
    expect(dogChip.selected, isTrue);

    final allergyChip = tester.widget<FilterChip>(
      find.ancestor(of: find.text('Allergy Free'), matching: find.byType(FilterChip)),
    );
    expect(allergyChip.selected, isTrue);
  });

  testWidgets('selecting options and saving sends both updated filter lists', (tester) async {
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
            _fullFiltersJson(petOwnership: '["Cat"]', petAllergyStatus: '["Has Pet Allergies"]'),
            200,
          );
        }
        return _jsonResponse(_fullFiltersJson(), 200);
      }),
    );

    await tester.pumpWidget(
      MaterialApp(home: PetCompatibilityFilterScreen(lifestyleFiltersApi: api)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Cat'));
    await tester.pump();
    await tester.tap(find.text('Has Pet Allergies'));
    await tester.pump();
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    expect(putRequest, isNotNull);
    expect(putRequest!.body, contains('"filterPetOwnership":["Cat"]'));
    expect(putRequest!.body, contains('"filterPetAllergyStatus":["Has Pet Allergies"]'));
  });
}
