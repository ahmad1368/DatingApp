import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/couples/couples_api.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

void main() {
  group('CouplesApi.fetchPartners', () {
    test('parses the linked partners with their display name', () async {
      final api = CouplesApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.url.path, '/couples/partners');
          return _jsonResponse(
            '[{"id":"link-1","partnerId":"user-2","partnerName":"Alex",'
            '"linkedAt":"2026-01-01T00:00:00.000Z","jointBrowsingEnabled":true}]',
            200,
          );
        }),
      );

      final partners = await api.fetchPartners();

      expect(partners, hasLength(1));
      expect(partners.first.id, 'link-1');
      expect(partners.first.partnerId, 'user-2');
      expect(partners.first.partnerName, 'Alex');
      expect(partners.first.jointBrowsingEnabled, isTrue);
    });

    test('throws CouplesApiException on a non-200 response', () async {
      final api = CouplesApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => _jsonResponse('{"message":"boom"}', 500)),
      );

      expect(() => api.fetchPartners(), throwsA(isA<CouplesApiException>()));
    });
  });

  group('CouplesApi.fetchActiveBrowsingPartnerId', () {
    test('parses null when browsing solo', () async {
      final api = CouplesApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/couples/active-browsing');
          return _jsonResponse('{"activeBrowsingPartnerId":null}', 200);
        }),
      );

      final partnerId = await api.fetchActiveBrowsingPartnerId();

      expect(partnerId, isNull);
    });

    test('parses the currently active browsing partner', () async {
      final api = CouplesApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse('{"activeBrowsingPartnerId":"user-2"}', 200),
        ),
      );

      final partnerId = await api.fetchActiveBrowsingPartnerId();

      expect(partnerId, 'user-2');
    });

    test('throws CouplesApiException on a non-200 response', () async {
      final api = CouplesApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => _jsonResponse('{"message":"boom"}', 500)),
      );

      expect(() => api.fetchActiveBrowsingPartnerId(), throwsA(isA<CouplesApiException>()));
    });
  });

  group('CouplesApi.setActiveBrowsingPartner', () {
    test('sends the partner id and parses the switched result', () async {
      http.Request? putRequest;
      final api = CouplesApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          putRequest = request;
          return _jsonResponse('{"activeBrowsingPartnerId":"user-2"}', 200);
        }),
      );

      final result = await api.setActiveBrowsingPartner('user-2');

      expect(putRequest, isNotNull);
      expect(putRequest!.method, 'PUT');
      expect(putRequest!.url.path, '/couples/active-browsing');
      expect(putRequest!.body, '{"partnerId":"user-2"}');
      expect(result, 'user-2');
    });

    test('omits partnerId to switch back to solo browsing', () async {
      http.Request? putRequest;
      final api = CouplesApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          putRequest = request;
          return _jsonResponse('{"activeBrowsingPartnerId":null}', 200);
        }),
      );

      final result = await api.setActiveBrowsingPartner(null);

      expect(putRequest!.body, '{}');
      expect(result, isNull);
    });

    test('throws CouplesApiException on a non-200 response', () async {
      final api = CouplesApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => _jsonResponse('{"message":"boom"}', 400)),
      );

      expect(
        () => api.setActiveBrowsingPartner('user-2'),
        throwsA(isA<CouplesApiException>()),
      );
    });
  });
}
