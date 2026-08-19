import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/profile/gender_identity_api.dart';

void main() {
  group('GenderIdentityApi.fetchCatalog', () {
    test('parses the catalog (no auth required)', () async {
      final api = GenderIdentityApi(
        client: MockClient((request) async {
          expect(request.url.path, '/profile/gender-identity/catalog');
          expect(request.headers.containsKey('Authorization'), isFalse);
          return http.Response(
            '{"genderIdentities":["Woman","Man"],"orientations":["Queer","Straight"]}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final catalog = await api.fetchCatalog();

      expect(catalog.genderIdentities, ['Woman', 'Man']);
      expect(catalog.orientations, ['Queer', 'Straight']);
    });
  });

  group('GenderIdentityApi.setGenderIdentity', () {
    test('sends the bearer token and payload, and parses the result', () async {
      final api = GenderIdentityApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'PUT');
          expect(request.url.path, '/profile/gender-identity');
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(
            request.body,
            '{"genderIdentities":["Non-binary"],"customGenderDescription":"Genderfluid",'
            '"showGenderOnProfile":false,"orientations":["Queer"],'
            '"showOrientationOnProfile":true}',
          );
          return http.Response(
            '{"genderIdentities":["Non-binary"],"customGenderDescription":"Genderfluid",'
            '"showGenderOnProfile":false,"orientations":["Queer"],'
            '"customOrientationDescription":null,"showOrientationOnProfile":true}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await api.setGenderIdentity(
        genderIdentities: const ['Non-binary'],
        customGenderDescription: 'Genderfluid',
        showGenderOnProfile: false,
        orientations: const ['Queer'],
        showOrientationOnProfile: true,
      );

      expect(result.genderIdentities, ['Non-binary']);
      expect(result.showGenderOnProfile, isFalse);
      expect(result.orientations, ['Queer']);
    });

    test('throws GenderIdentityApiException on a non-200 response', () async {
      final api = GenderIdentityApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"each value in genderIdentities must be a valid enum value"}',
            400,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(
        () => api.setGenderIdentity(
          genderIdentities: const ['Not A Real Option'],
          showGenderOnProfile: true,
          orientations: const [],
          showOrientationOnProfile: true,
        ),
        throwsA(isA<GenderIdentityApiException>()),
      );
    });
  });
}
