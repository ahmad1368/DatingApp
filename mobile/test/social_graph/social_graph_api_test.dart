import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/social_graph/social_graph_api.dart';

void main() {
  group('SocialGraphApi.syncContacts', () {
    test('sends the bearer token and contact list, parsing the synced count', () async {
      final api = SocialGraphApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.method, 'POST');
          expect(request.url.path, '/social-graph/contacts');
          expect(request.body, '{"contacts":["+15551234567","friend@example.com"]}');
          return http.Response(
            '{"totalSynced":2}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await api.syncContacts(['+15551234567', 'friend@example.com']);

      expect(result.totalSynced, 2);
    });

    test('throws SocialGraphApiException on a non-200 response', () async {
      final api = SocialGraphApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.syncContacts(['x']), throwsA(isA<SocialGraphApiException>()));
    });
  });
}
