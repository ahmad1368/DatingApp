import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/profile/lifestyle_filters_api.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

String _fullFiltersJson({
  String relationshipGoals = '[]',
  bool verifiedOnly = false,
  String communityGroups = '[]',
}) =>
    '''
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
  "filterVerifiedOnly": $verifiedOnly,
  "filterCommunityGroups": $communityGroups
}
''';

void main() {
  group('LifestyleFiltersApi.fetchRelationshipGoalOptions', () {
    test('parses the relationship goal catalog', () async {
      final api = LifestyleFiltersApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/profile/lifestyle/catalog');
          return _jsonResponse('{"relationshipGoals":["LONG_TERM","CASUAL","FRIENDSHIP","NOT_SURE"]}', 200);
        }),
      );

      final options = await api.fetchRelationshipGoalOptions();

      expect(options, ['LONG_TERM', 'CASUAL', 'FRIENDSHIP', 'NOT_SURE']);
    });

    test('throws LifestyleFiltersApiException on a non-200 response', () async {
      final api = LifestyleFiltersApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => _jsonResponse('{"message":"boom"}', 500)),
      );

      expect(() => api.fetchRelationshipGoalOptions(), throwsA(isA<LifestyleFiltersApiException>()));
    });
  });

  group('LifestyleFiltersApi.fetchFilters', () {
    test('sends the bearer token and parses the current filters', () async {
      final api = LifestyleFiltersApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.url.path, '/profile/lifestyle');
          return _jsonResponse(_fullFiltersJson(relationshipGoals: '["LONG_TERM"]'), 200);
        }),
      );

      final filters = await api.fetchFilters();

      expect(filters.filterRelationshipGoals, ['LONG_TERM']);
      expect(filters.filterSharedInterestsOnly, isFalse);
    });
  });

  group('LifestyleFiltersApi.setFilters', () {
    test('sends a PUT with the full filter set and parses the result', () async {
      http.Request? putRequest;
      final api = LifestyleFiltersApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          putRequest = request;
          return _jsonResponse(_fullFiltersJson(relationshipGoals: '["CASUAL"]'), 200);
        }),
      );
      final current = await LifestyleFiltersApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => _jsonResponse(_fullFiltersJson(), 200)),
      ).fetchFilters();

      final updated = await api.setFilters(current.copyWith(filterRelationshipGoals: ['CASUAL']));

      expect(putRequest, isNotNull);
      expect(putRequest!.method, 'PUT');
      expect(putRequest!.url.path, '/profile/lifestyle');
      expect(putRequest!.body, contains('"filterRelationshipGoals":["CASUAL"]'));
      expect(updated.filterRelationshipGoals, ['CASUAL']);
    });

    test('throws LifestyleFiltersApiException on a non-200 response', () async {
      final api = LifestyleFiltersApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => _jsonResponse('{"message":"boom"}', 400)),
      );
      final filters = LifestyleFilters(
        showLifestyleBadgesOnProfile: true,
        filterSmokingHabits: const [],
        filterDrinkingHabits: const [],
        filterEducationLevels: const [],
        filterReligions: const [],
        filterDietaryPreferences: const [],
        filterWantsChildren: const [],
        filterRelationshipGoals: const [],
        filterKinkTags: const [],
        filterRelationshipDesires: const [],
        filterSharedInterestsOnly: false,
        filterVerifiedOnly: false,
        filterCommunityGroups: const [],
      );

      expect(() => api.setFilters(filters), throwsA(isA<LifestyleFiltersApiException>()));
    });

    test('sends the updated filterVerifiedOnly flag', () async {
      http.Request? putRequest;
      final api = LifestyleFiltersApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          putRequest = request;
          return _jsonResponse(_fullFiltersJson(verifiedOnly: true), 200);
        }),
      );
      final current = await LifestyleFiltersApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => _jsonResponse(_fullFiltersJson(), 200)),
      ).fetchFilters();

      final updated = await api.setFilters(current.copyWith(filterVerifiedOnly: true));

      expect(putRequest!.body, contains('"filterVerifiedOnly":true'));
      expect(updated.filterVerifiedOnly, isTrue);
    });

    test('sends the updated filterCommunityGroups list', () async {
      http.Request? putRequest;
      final api = LifestyleFiltersApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          putRequest = request;
          return _jsonResponse(_fullFiltersJson(communityGroups: '["book-lovers"]'), 200);
        }),
      );
      final current = await LifestyleFiltersApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => _jsonResponse(_fullFiltersJson(), 200)),
      ).fetchFilters();

      final updated = await api.setFilters(
        current.copyWith(filterCommunityGroups: ['book-lovers']),
      );

      expect(putRequest!.body, contains('"filterCommunityGroups":["book-lovers"]'));
      expect(updated.filterCommunityGroups, ['book-lovers']);
    });
  });
}
