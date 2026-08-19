import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/discovery/discovery_api.dart';

void main() {
  group('DiscoveryApi.fetchDeck', () {
    test('sends the bearer token and parses the deck', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/discovery/deck');
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          return http.Response(
            '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
            '"distanceKm":3.4,"interests":["Hiking"],"relationshipGoal":"CASUAL"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final deck = await api.fetchDeck();

      expect(deck, hasLength(1));
      expect(deck.first.id, 'user-2');
      expect(deck.first.name, 'Jane');
      expect(deck.first.age, 25);
      expect(deck.first.interests, ['Hiking']);
      expect(deck.first.isSuperLike, isFalse);
    });

    test('parses isSuperLike when the backend includes it', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
            '"distanceKm":3.4,"interests":["Hiking"],"relationshipGoal":"CASUAL","isSuperLike":true}]',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final deck = await api.fetchDeck();

      expect(deck.first.isSuperLike, isTrue);
    });

    test('throws DiscoveryApiException on a non-200 response', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchDeck(), throwsA(isA<DiscoveryApiException>()));
    });
  });

  group('DiscoveryApi.recordSwipe', () {
    test('sends the target and action, and parses a match result', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/discovery/swipe');
          expect(request.body, '{"targetUserId":"user-2","action":"LIKE"}');
          return http.Response(
            '{"matched":true,"matchId":"match-1"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await api.recordSwipe(targetUserId: 'user-2', action: 'LIKE');

      expect(result.matched, isTrue);
      expect(result.matchId, 'match-1');
    });

    test('sends a SUPER_LIKE action', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.body, '{"targetUserId":"user-2","action":"SUPER_LIKE"}');
          return http.Response(
            '{"matched":false}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await api.recordSwipe(targetUserId: 'user-2', action: 'SUPER_LIKE');

      expect(result.matched, isFalse);
    });

    test('throws DiscoveryApiException when the backend rejects the request', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"You have already swiped on this user."}',
            400,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(
        () => api.recordSwipe(targetUserId: 'user-2', action: 'LIKE'),
        throwsA(isA<DiscoveryApiException>()),
      );
    });
  });

  group('DiscoveryApi.undoLastSwipe', () {
    test('sends a POST and parses the undone swipe', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/discovery/undo');
          return http.Response(
            '{"targetUserId":"user-2","action":"PASS","hadMatch":false}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await api.undoLastSwipe();

      expect(result.targetUserId, 'user-2');
      expect(result.action, 'PASS');
      expect(result.hadMatch, isFalse);
    });

    test('throws DiscoveryApiException when the user is not premium', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"Rewind is a premium feature."}',
            403,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(() => api.undoLastSwipe(), throwsA(isA<DiscoveryApiException>()));
    });
  });

  group('DiscoveryApi.setIncognitoMode', () {
    test('sends a PUT with the enabled flag and parses the result', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'PUT');
          expect(request.url.path, '/discovery/incognito');
          expect(request.body, '{"enabled":true}');
          return http.Response(
            '{"incognitoEnabled":true}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await api.setIncognitoMode(true);

      expect(result, isTrue);
    });

    test('throws DiscoveryApiException when enabling for a non-premium user', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"Incognito mode is a premium feature."}',
            403,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(() => api.setIncognitoMode(true), throwsA(isA<DiscoveryApiException>()));
    });
  });
}
