import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/profile/relationship_profile_api.dart';

void main() {
  group('RelationshipProfileApi.fetchCatalog', () {
    test('parses the catalog (no auth required)', () async {
      final api = RelationshipProfileApi(
        client: MockClient((request) async {
          expect(request.url.path, '/profile/relationship/catalog');
          expect(request.headers.containsKey('Authorization'), isFalse);
          return http.Response(
            '{"relationshipStructures":["Monogamous","Open"],"kinkTags":["BDSM"],'
            '"relationshipDesires":["Marriage","Casual Dating"],'
            '"boundaryTags":["Sober / Substance-Free"]}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final catalog = await api.fetchCatalog();

      expect(catalog.relationshipStructures, ['Monogamous', 'Open']);
      expect(catalog.kinkTags, ['BDSM']);
      expect(catalog.relationshipDesires, ['Marriage', 'Casual Dating']);
      expect(catalog.boundaryTags, ['Sober / Substance-Free']);
    });
  });

  group('RelationshipProfileApi.fetchRelationshipProfile', () {
    test('sends the bearer token and parses the result', () async {
      final api = RelationshipProfileApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/profile/relationship');
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          return http.Response(
            '{"relationshipStructure":"Monogamous","showRelationshipStructureOnProfile":true,'
            '"kinkTags":[],"showKinkTagsOnProfile":true,"relationshipDesires":["Marriage"],'
            '"showRelationshipDesiresOnProfile":true,"customRelationshipIntent":null,'
            '"showCustomRelationshipIntentOnProfile":true,"communicationBoundaries":null,'
            '"showCommunicationBoundariesOnProfile":true,"boundaryTags":["No Kids"],'
            '"showBoundaryTagsOnProfile":true}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await api.fetchRelationshipProfile();

      expect(result.relationshipStructure, 'Monogamous');
      expect(result.relationshipDesires, ['Marriage']);
      expect(result.customRelationshipIntent, isNull);
      expect(result.boundaryTags, ['No Kids']);
    });
  });

  group('RelationshipProfileApi.setRelationshipProfile', () {
    test('sends the payload and parses the result', () async {
      final api = RelationshipProfileApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'PUT');
          expect(request.url.path, '/profile/relationship');
          expect(
            request.body,
            '{"relationshipStructure":"Polyamorous","showRelationshipStructureOnProfile":false,'
            '"kinkTags":["BDSM"],"showKinkTagsOnProfile":true,'
            '"relationshipDesires":["Marriage","Casual Dating"],'
            '"showRelationshipDesiresOnProfile":true,'
            '"customRelationshipIntent":"Open to relocating",'
            '"showCustomRelationshipIntentOnProfile":false,'
            '"communicationBoundaries":"Texting only until we meet",'
            '"showCommunicationBoundariesOnProfile":false,'
            '"boundaryTags":["No Kids"],"showBoundaryTagsOnProfile":true}',
          );
          return http.Response(
            '{"relationshipStructure":"Polyamorous","showRelationshipStructureOnProfile":false,'
            '"kinkTags":["BDSM"],"showKinkTagsOnProfile":true,'
            '"relationshipDesires":["Marriage","Casual Dating"],'
            '"showRelationshipDesiresOnProfile":true,'
            '"customRelationshipIntent":"Open to relocating",'
            '"showCustomRelationshipIntentOnProfile":false,'
            '"communicationBoundaries":"Texting only until we meet",'
            '"showCommunicationBoundariesOnProfile":false,'
            '"boundaryTags":["No Kids"],"showBoundaryTagsOnProfile":true}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await api.setRelationshipProfile(
        relationshipStructure: 'Polyamorous',
        showRelationshipStructureOnProfile: false,
        kinkTags: const ['BDSM'],
        showKinkTagsOnProfile: true,
        relationshipDesires: const ['Marriage', 'Casual Dating'],
        showRelationshipDesiresOnProfile: true,
        customRelationshipIntent: 'Open to relocating',
        showCustomRelationshipIntentOnProfile: false,
        communicationBoundaries: 'Texting only until we meet',
        showCommunicationBoundariesOnProfile: false,
        boundaryTags: const ['No Kids'],
        showBoundaryTagsOnProfile: true,
      );

      expect(result.relationshipStructure, 'Polyamorous');
      expect(result.customRelationshipIntent, 'Open to relocating');
      expect(result.showCustomRelationshipIntentOnProfile, isFalse);
      expect(result.communicationBoundaries, 'Texting only until we meet');
      expect(result.boundaryTags, ['No Kids']);
    });

    test('omits null optional fields from the request body', () async {
      final api = RelationshipProfileApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(
            request.body,
            '{"showRelationshipStructureOnProfile":true,"kinkTags":[],'
            '"showKinkTagsOnProfile":true,"relationshipDesires":[],'
            '"showRelationshipDesiresOnProfile":true,'
            '"showCustomRelationshipIntentOnProfile":true,'
            '"showCommunicationBoundariesOnProfile":true,'
            '"boundaryTags":[],"showBoundaryTagsOnProfile":true}',
          );
          return http.Response(
            '{"relationshipStructure":null,"showRelationshipStructureOnProfile":true,'
            '"kinkTags":[],"showKinkTagsOnProfile":true,"relationshipDesires":[],'
            '"showRelationshipDesiresOnProfile":true,"customRelationshipIntent":null,'
            '"showCustomRelationshipIntentOnProfile":true,"communicationBoundaries":null,'
            '"showCommunicationBoundariesOnProfile":true,"boundaryTags":[],'
            '"showBoundaryTagsOnProfile":true}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      await api.setRelationshipProfile(
        showRelationshipStructureOnProfile: true,
        kinkTags: const [],
        showKinkTagsOnProfile: true,
        relationshipDesires: const [],
        showRelationshipDesiresOnProfile: true,
        showCustomRelationshipIntentOnProfile: true,
        showCommunicationBoundariesOnProfile: true,
        boundaryTags: const [],
        showBoundaryTagsOnProfile: true,
      );
    });

    test('throws RelationshipProfileApiException on a non-200 response', () async {
      final api = RelationshipProfileApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"customRelationshipIntent must be shorter than or equal to 60 characters"}',
            400,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(
        () => api.setRelationshipProfile(
          showRelationshipStructureOnProfile: true,
          kinkTags: const [],
          showKinkTagsOnProfile: true,
          relationshipDesires: const [],
          showRelationshipDesiresOnProfile: true,
          showCustomRelationshipIntentOnProfile: true,
          showCommunicationBoundariesOnProfile: true,
          boundaryTags: const [],
          showBoundaryTagsOnProfile: true,
        ),
        throwsA(isA<RelationshipProfileApiException>()),
      );
    });
  });
}
