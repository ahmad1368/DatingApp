import 'dart:convert';

import 'package:http/http.dart' as http;

class LifestyleFiltersApiException implements Exception {
  LifestyleFiltersApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// The full set of lifestyle preferences and deck filters. Only
/// `filterRelationshipGoals`/`filterVerifiedOnly`/`filterCommunityGroups`/
/// `filterRelationshipDesires` are editable via `copyWith`; every other
/// field is round-tripped unchanged so a save here never clobbers filters
/// set elsewhere.
class LifestyleFilters {
  LifestyleFilters({
    this.smokingHabit,
    this.drinkingHabit,
    this.education,
    this.religion,
    this.dietaryPreference,
    this.wantsChildren,
    this.heightCm,
    this.workoutHabit,
    this.petOwnership,
    this.petAllergyStatus,
    this.politicalOrientation,
    this.civicActivityLevel,
    required this.showLifestyleBadgesOnProfile,
    required this.filterSmokingHabits,
    required this.filterDrinkingHabits,
    required this.filterEducationLevels,
    required this.filterReligions,
    required this.filterDietaryPreferences,
    required this.filterWantsChildren,
    required this.filterRelationshipGoals,
    required this.filterKinkTags,
    required this.filterRelationshipDesires,
    required this.filterBoundaryTags,
    required this.filterPetOwnership,
    required this.filterPetAllergyStatus,
    required this.filterPoliticalOrientations,
    required this.filterSharedInterestsOnly,
    required this.filterVerifiedOnly,
    required this.filterCommunityGroups,
  });

  final String? smokingHabit;
  final String? drinkingHabit;
  final String? education;
  final String? religion;
  final String? dietaryPreference;
  final String? wantsChildren;
  final int? heightCm;
  final String? workoutHabit;
  final String? petOwnership;
  final String? petAllergyStatus;
  final String? politicalOrientation;
  final String? civicActivityLevel;
  final bool showLifestyleBadgesOnProfile;
  final List<String> filterSmokingHabits;
  final List<String> filterDrinkingHabits;
  final List<String> filterEducationLevels;
  final List<String> filterReligions;
  final List<String> filterDietaryPreferences;
  final List<String> filterWantsChildren;
  final List<String> filterRelationshipGoals;
  final List<String> filterKinkTags;
  final List<String> filterRelationshipDesires;
  final List<String> filterBoundaryTags;
  final List<String> filterPetOwnership;
  final List<String> filterPetAllergyStatus;
  final List<String> filterPoliticalOrientations;
  final bool filterSharedInterestsOnly;
  final bool filterVerifiedOnly;
  final List<String> filterCommunityGroups;

  LifestyleFilters copyWith({
    List<String>? filterRelationshipGoals,
    List<String>? filterRelationshipDesires,
    List<String>? filterPetOwnership,
    List<String>? filterPetAllergyStatus,
    List<String>? filterPoliticalOrientations,
    bool? filterVerifiedOnly,
    List<String>? filterCommunityGroups,
  }) {
    return LifestyleFilters(
      smokingHabit: smokingHabit,
      drinkingHabit: drinkingHabit,
      education: education,
      religion: religion,
      dietaryPreference: dietaryPreference,
      wantsChildren: wantsChildren,
      heightCm: heightCm,
      workoutHabit: workoutHabit,
      petOwnership: petOwnership,
      petAllergyStatus: petAllergyStatus,
      politicalOrientation: politicalOrientation,
      civicActivityLevel: civicActivityLevel,
      showLifestyleBadgesOnProfile: showLifestyleBadgesOnProfile,
      filterSmokingHabits: filterSmokingHabits,
      filterDrinkingHabits: filterDrinkingHabits,
      filterEducationLevels: filterEducationLevels,
      filterReligions: filterReligions,
      filterDietaryPreferences: filterDietaryPreferences,
      filterWantsChildren: filterWantsChildren,
      filterRelationshipGoals: filterRelationshipGoals ?? this.filterRelationshipGoals,
      filterKinkTags: filterKinkTags,
      filterRelationshipDesires: filterRelationshipDesires ?? this.filterRelationshipDesires,
      filterBoundaryTags: filterBoundaryTags,
      filterPetOwnership: filterPetOwnership ?? this.filterPetOwnership,
      filterPetAllergyStatus: filterPetAllergyStatus ?? this.filterPetAllergyStatus,
      filterPoliticalOrientations: filterPoliticalOrientations ?? this.filterPoliticalOrientations,
      filterSharedInterestsOnly: filterSharedInterestsOnly,
      filterVerifiedOnly: filterVerifiedOnly ?? this.filterVerifiedOnly,
      filterCommunityGroups: filterCommunityGroups ?? this.filterCommunityGroups,
    );
  }
}

/// Talks to the backend's lifestyle-filter endpoints. Used here just for
/// the "match intent" (relationship goal) deck filter; see
/// RelationshipGoalFilterScreen.
class LifestyleFiltersApi {
  LifestyleFiltersApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<List<String>> fetchRelationshipGoalOptions() async {
    final response = await _client.get(Uri.parse('$_baseUrl/profile/lifestyle/catalog'));

    if (response.statusCode != 200) {
      throw LifestyleFiltersApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return (body['relationshipGoals'] as List).cast<String>();
  }

  Future<List<String>> fetchRelationshipDesireOptions() async {
    final response = await _client.get(Uri.parse('$_baseUrl/profile/lifestyle/catalog'));

    if (response.statusCode != 200) {
      throw LifestyleFiltersApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return (body['relationshipDesires'] as List).cast<String>();
  }

  Future<List<String>> fetchPetOwnershipOptions() async {
    final response = await _client.get(Uri.parse('$_baseUrl/profile/lifestyle/catalog'));

    if (response.statusCode != 200) {
      throw LifestyleFiltersApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return (body['petOwnershipOptions'] as List).cast<String>();
  }

  Future<List<String>> fetchPetAllergyStatusOptions() async {
    final response = await _client.get(Uri.parse('$_baseUrl/profile/lifestyle/catalog'));

    if (response.statusCode != 200) {
      throw LifestyleFiltersApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return (body['petAllergyStatusOptions'] as List).cast<String>();
  }

  Future<List<String>> fetchPoliticalOrientationOptions() async {
    final response = await _client.get(Uri.parse('$_baseUrl/profile/lifestyle/catalog'));

    if (response.statusCode != 200) {
      throw LifestyleFiltersApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return (body['politicalOrientations'] as List).cast<String>();
  }

  Future<LifestyleFilters> fetchFilters() async {
    final response = await _client.get(Uri.parse('$_baseUrl/profile/lifestyle'), headers: _headers);

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw LifestyleFiltersApiException(_errorMessage(body, response.statusCode));
    }

    return _toFilters(body);
  }

  Future<LifestyleFilters> setFilters(LifestyleFilters filters) async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/profile/lifestyle'),
      headers: _headers,
      body: jsonEncode({
        'smokingHabit': ?filters.smokingHabit,
        'drinkingHabit': ?filters.drinkingHabit,
        'education': ?filters.education,
        'religion': ?filters.religion,
        'dietaryPreference': ?filters.dietaryPreference,
        'wantsChildren': ?filters.wantsChildren,
        'heightCm': ?filters.heightCm,
        'workoutHabit': ?filters.workoutHabit,
        'petOwnership': ?filters.petOwnership,
        'petAllergyStatus': ?filters.petAllergyStatus,
        'politicalOrientation': ?filters.politicalOrientation,
        'civicActivityLevel': ?filters.civicActivityLevel,
        'showLifestyleBadgesOnProfile': filters.showLifestyleBadgesOnProfile,
        'filterSmokingHabits': filters.filterSmokingHabits,
        'filterDrinkingHabits': filters.filterDrinkingHabits,
        'filterEducationLevels': filters.filterEducationLevels,
        'filterReligions': filters.filterReligions,
        'filterDietaryPreferences': filters.filterDietaryPreferences,
        'filterWantsChildren': filters.filterWantsChildren,
        'filterRelationshipGoals': filters.filterRelationshipGoals,
        'filterKinkTags': filters.filterKinkTags,
        'filterRelationshipDesires': filters.filterRelationshipDesires,
        'filterBoundaryTags': filters.filterBoundaryTags,
        'filterPetOwnership': filters.filterPetOwnership,
        'filterPetAllergyStatus': filters.filterPetAllergyStatus,
        'filterPoliticalOrientations': filters.filterPoliticalOrientations,
        'filterSharedInterestsOnly': filters.filterSharedInterestsOnly,
        'filterVerifiedOnly': filters.filterVerifiedOnly,
        'filterCommunityGroups': filters.filterCommunityGroups,
      }),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw LifestyleFiltersApiException(_errorMessage(body, response.statusCode));
    }

    return _toFilters(body);
  }

  LifestyleFilters _toFilters(Map<String, dynamic> json) {
    return LifestyleFilters(
      smokingHabit: json['smokingHabit'] as String?,
      drinkingHabit: json['drinkingHabit'] as String?,
      education: json['education'] as String?,
      religion: json['religion'] as String?,
      dietaryPreference: json['dietaryPreference'] as String?,
      wantsChildren: json['wantsChildren'] as String?,
      heightCm: json['heightCm'] as int?,
      workoutHabit: json['workoutHabit'] as String?,
      petOwnership: json['petOwnership'] as String?,
      petAllergyStatus: json['petAllergyStatus'] as String?,
      politicalOrientation: json['politicalOrientation'] as String?,
      civicActivityLevel: json['civicActivityLevel'] as String?,
      showLifestyleBadgesOnProfile: json['showLifestyleBadgesOnProfile'] as bool,
      filterSmokingHabits: (json['filterSmokingHabits'] as List).cast<String>(),
      filterDrinkingHabits: (json['filterDrinkingHabits'] as List).cast<String>(),
      filterEducationLevels: (json['filterEducationLevels'] as List).cast<String>(),
      filterReligions: (json['filterReligions'] as List).cast<String>(),
      filterDietaryPreferences: (json['filterDietaryPreferences'] as List).cast<String>(),
      filterWantsChildren: (json['filterWantsChildren'] as List).cast<String>(),
      filterRelationshipGoals: (json['filterRelationshipGoals'] as List).cast<String>(),
      filterKinkTags: (json['filterKinkTags'] as List).cast<String>(),
      filterRelationshipDesires: (json['filterRelationshipDesires'] as List).cast<String>(),
      filterBoundaryTags: (json['filterBoundaryTags'] as List).cast<String>(),
      filterPetOwnership: (json['filterPetOwnership'] as List).cast<String>(),
      filterPetAllergyStatus: (json['filterPetAllergyStatus'] as List).cast<String>(),
      filterPoliticalOrientations: (json['filterPoliticalOrientations'] as List).cast<String>(),
      filterSharedInterestsOnly: json['filterSharedInterestsOnly'] as bool,
      filterVerifiedOnly: json['filterVerifiedOnly'] as bool,
      filterCommunityGroups: (json['filterCommunityGroups'] as List).cast<String>(),
    );
  }

  Map<String, dynamic> _decode(http.Response response) {
    if (response.body.isEmpty) {
      return const {};
    }
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  String _errorMessage(Map<String, dynamic> body, int statusCode) {
    final message = body['message'];
    if (message is String) {
      return message;
    }
    if (message is List && message.isNotEmpty) {
      return message.first.toString();
    }
    return 'Request failed with status $statusCode';
  }
}
