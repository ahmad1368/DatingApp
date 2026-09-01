import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/discovery/discovery_api.dart';

void main() {
  group('DiscoveryApi.fetchPassReasons', () {
    test('sends the bearer token and parses the reason catalog', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.url.path, '/discovery/pass-reasons');
          return http.Response(
            '["Not my type","Too far away"]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final reasons = await api.fetchPassReasons();

      expect(reasons, ['Not my type', 'Too far away']);
    });

    test('throws DiscoveryApiException on a non-200 response', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchPassReasons(), throwsA(isA<DiscoveryApiException>()));
    });
  });

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
      expect(deck.first.relationshipIntentBadges, isEmpty);
    });

    test('parses relationshipIntentBadges when the backend includes them', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
            '"distanceKm":3.4,"interests":["Hiking"],"relationshipGoal":"CASUAL",'
            '"relationshipIntentBadges":["Marriage","Long-Term Relationship"]}]',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final deck = await api.fetchDeck();

      expect(deck.first.relationshipIntentBadges, ['Marriage', 'Long-Term Relationship']);
    });

    test('parses lifestyleBadges when the backend includes them', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
            '"distanceKm":3.4,"interests":["Hiking"],"relationshipGoal":"CASUAL",'
            '"lifestyleBadges":["178 cm","Workout: Often","Dog"]}]',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final deck = await api.fetchDeck();

      expect(deck.first.lifestyleBadges, ['178 cm', 'Workout: Often', 'Dog']);
    });

    test('parses relationshipStructure and kinkTagBadges when the backend includes them', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
            '"distanceKm":3.4,"interests":["Hiking"],"relationshipGoal":"CASUAL",'
            '"relationshipStructure":"Solo Polyamorous","kinkTagBadges":["Dominant"]}]',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final deck = await api.fetchDeck();

      expect(deck.first.relationshipStructure, 'Solo Polyamorous');
      expect(deck.first.kinkTagBadges, ['Dominant']);
    });

    test('parses responseRateBadge when the backend includes it', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
            '"distanceKm":3.4,"interests":["Hiking"],"relationshipGoal":"CASUAL",'
            '"responseRateBadge":"Very Responsive"}]',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final deck = await api.fetchDeck();

      expect(deck.first.responseRateBadge, 'Very Responsive');
    });

    test('defaults responseRateBadge to null when the backend omits it', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
            '"distanceKm":3.4,"interests":["Hiking"],"relationshipGoal":"CASUAL"}]',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final deck = await api.fetchDeck();

      expect(deck.first.responseRateBadge, isNull);
    });

    test('parses isTraveling when the backend includes it', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
            '"distanceKm":3.4,"interests":["Hiking"],"relationshipGoal":"CASUAL",'
            '"isTraveling":true}]',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final deck = await api.fetchDeck();

      expect(deck.first.isTraveling, isTrue);
    });

    test('defaults isTraveling to false when the backend omits it', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
            '"distanceKm":3.4,"interests":["Hiking"],"relationshipGoal":"CASUAL"}]',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final deck = await api.fetchDeck();

      expect(deck.first.isTraveling, isFalse);
    });

    test('parses videoSnippetUrl when the backend includes it', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
            '"videoSnippetUrl":"https://example.com/snippet.mp4",'
            '"distanceKm":3.4,"interests":["Hiking"],"relationshipGoal":"CASUAL"}]',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final deck = await api.fetchDeck();

      expect(deck.first.videoSnippetUrl, 'https://example.com/snippet.mp4');
    });

    test('parses voiceIntroUrl and voiceIntroDurationSeconds when the backend includes them', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
            '"voiceIntroUrl":"https://example.com/voice-intro.m4a","voiceIntroDurationSeconds":18,'
            '"distanceKm":3.4,"interests":["Hiking"],"relationshipGoal":"CASUAL"}]',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final deck = await api.fetchDeck();

      expect(deck.first.voiceIntroUrl, 'https://example.com/voice-intro.m4a');
      expect(deck.first.voiceIntroDurationSeconds, 18);
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

    test('parses isPriorityLike when the backend includes it', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
            '"distanceKm":3.4,"interests":["Hiking"],"relationshipGoal":"CASUAL","isPriorityLike":true}]',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final deck = await api.fetchDeck();

      expect(deck.first.isPriorityLike, isTrue);
    });

    test('parses a compliment attached to a liked-by card', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
            '"distanceKm":3.4,"interests":["Hiking"],"relationshipGoal":"CASUAL",'
            '"complimentText":"Love your hiking photo!","complimentTarget":"your hiking photo"}]',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final deck = await api.fetchDeck();

      expect(deck.first.complimentText, 'Love your hiking photo!');
      expect(deck.first.complimentTarget, 'your hiking photo');
    });

    test('parses zodiacSign when the backend includes it', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
            '"distanceKm":3.4,"interests":["Hiking"],"relationshipGoal":"CASUAL","zodiacSign":"Leo"}]',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final deck = await api.fetchDeck();

      expect(deck.first.zodiacSign, 'Leo');
    });

    test('parses sharedSchool when the backend includes it', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
            '"distanceKm":3.4,"interests":["Hiking"],"relationshipGoal":"CASUAL","sharedSchool":"NYU"}]',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final deck = await api.fetchDeck();

      expect(deck.first.sharedSchool, 'NYU');
    });

    test('parses loveStyleBadges when the backend includes them', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
            '"distanceKm":3.4,"interests":["Hiking"],"relationshipGoal":"CASUAL",'
            '"loveStyleBadges":["Physical Touch","Secure Attachment"]}]',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final deck = await api.fetchDeck();

      expect(deck.first.loveStyleBadges, ['Physical Touch', 'Secure Attachment']);
    });

    test('parses sharedInterests when the backend includes them', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
            '"distanceKm":3.4,"interests":["Hiking","Gaming"],"relationshipGoal":"CASUAL",'
            '"sharedInterests":["Hiking"]}]',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final deck = await api.fetchDeck();

      expect(deck.first.sharedInterests, ['Hiking']);
    });

    test('parses sharedCommunityGroups when the backend includes them', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
            '"distanceKm":3.4,"interests":[],"relationshipGoal":"CASUAL",'
            '"sharedCommunityGroups":["Gamers"]}]',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final deck = await api.fetchDeck();

      expect(deck.first.sharedCommunityGroups, ['Gamers']);
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

    test('sends the passReason when provided', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(
            request.body,
            '{"targetUserId":"user-2","action":"PASS","passReason":"Not my type"}',
          );
          return http.Response('{"matched":false}', 200, headers: {'content-type': 'application/json'});
        }),
      );

      await api.recordSwipe(targetUserId: 'user-2', action: 'PASS', passReason: 'Not my type');
    });

    test('sends a compliment when liking with one attached', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(
            request.body,
            '{"targetUserId":"user-2","action":"LIKE",'
            '"complimentText":"Love your hiking photo!","complimentTarget":"your hiking photo"}',
          );
          return http.Response(
            '{"matched":false}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      await api.recordSwipe(
        targetUserId: 'user-2',
        action: 'LIKE',
        complimentText: 'Love your hiking photo!',
        complimentTarget: 'your hiking photo',
      );
    });

    test('sends an icebreaker answer when liking with one attached', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(
            request.body,
            '{"targetUserId":"user-2","action":"LIKE",'
            '"icebreakerPromptId":"coffee-or-tea","icebreakerOptionIndex":0}',
          );
          return http.Response('{"matched":false}', 200, headers: {'content-type': 'application/json'});
        }),
      );

      await api.recordSwipe(
        targetUserId: 'user-2',
        action: 'LIKE',
        icebreakerPromptId: 'coffee-or-tea',
        icebreakerOptionIndex: 0,
      );
    });

    test('sends usePriorityLike when spending a priority like credit', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(
            request.body,
            '{"targetUserId":"user-2","action":"LIKE","usePriorityLike":true}',
          );
          return http.Response('{"matched":false}', 200, headers: {'content-type': 'application/json'});
        }),
      );

      await api.recordSwipe(targetUserId: 'user-2', action: 'LIKE', usePriorityLike: true);
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

  group('DiscoveryApi.submitDeckFeedback', () {
    test('sends the rating and parses the updated proximity weight', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/discovery/deck-feedback');
          expect(request.body, '{"rating":"BAD"}');
          return http.Response(
            '{"discoveryProximityWeight":1.3}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final weight = await api.submitDeckFeedback('BAD');

      expect(weight, 1.3);
    });

    test('throws DiscoveryApiException on a non-200 response', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.submitDeckFeedback('GOOD'), throwsA(isA<DiscoveryApiException>()));
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

  group('DiscoveryApi.activateBoost', () {
    test('sends a POST and parses the active boost status', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/discovery/boost');
          return http.Response(
            '{"active":true,"expiresAt":"2026-01-01T00:30:00.000Z","viewCount":0}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final status = await api.activateBoost();

      expect(status.active, isTrue);
      expect(status.expiresAt, DateTime.parse('2026-01-01T00:30:00.000Z'));
      expect(status.viewCount, 0);
    });

    test('throws DiscoveryApiException when the user is not premium', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"Boost is a premium feature."}',
            403,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(() => api.activateBoost(), throwsA(isA<DiscoveryApiException>()));
    });
  });

  group('DiscoveryApi.fetchBoostStatus', () {
    test('parses an inactive status', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'GET');
          expect(request.url.path, '/discovery/boost');
          return http.Response(
            '{"active":false,"expiresAt":null,"viewCount":0}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final status = await api.fetchBoostStatus();

      expect(status.active, isFalse);
      expect(status.expiresAt, isNull);
    });
  });

  group('DiscoveryApi.activateSuperBoost', () {
    test('sends a POST and parses the super boost status', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/discovery/boost/super');
          return http.Response(
            '{"active":true,"expiresAt":"2026-01-01T00:30:00.000Z","viewCount":0,'
            '"tier":"SUPER","viewMultiplier":100}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final status = await api.activateSuperBoost();

      expect(status.active, isTrue);
      expect(status.tier, 'SUPER');
      expect(status.viewMultiplier, 100);
    });

    test('throws DiscoveryApiException when the user is not Platinum', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"Super Boost requires a Platinum subscription."}',
            403,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(() => api.activateSuperBoost(), throwsA(isA<DiscoveryApiException>()));
    });
  });

  group('DiscoveryApi.fetchLikedByGrid', () {
    test('sends the bearer token and parses the grid', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'GET');
          expect(request.url.path, '/discovery/likes');
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          return http.Response(
            '[{"id":"user-3","name":"Sam","age":29,"profilePhotoUrl":null,'
            '"distanceKm":1.2,"interests":["Coffee"],"relationshipGoal":"CASUAL","isSuperLike":true}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final grid = await api.fetchLikedByGrid();

      expect(grid, hasLength(1));
      expect(grid.first.id, 'user-3');
      expect(grid.first.name, 'Sam');
      expect(grid.first.isSuperLike, isTrue);
    });

    test('throws DiscoveryApiException when the user is not premium', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"Seeing who liked you is a premium feature."}',
            403,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(() => api.fetchLikedByGrid(), throwsA(isA<DiscoveryApiException>()));
    });

    test('sends a sortBy query parameter when provided', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.queryParameters['sortBy'], 'PROXIMITY');
          return http.Response('[]', 200, headers: {'content-type': 'application/json'});
        }),
      );

      await api.fetchLikedByGrid(sortBy: 'PROXIMITY');
    });
  });

  group('DiscoveryApi.setActiveMode', () {
    test('sends a PUT with the mode and parses the result', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'PUT');
          expect(request.url.path, '/discovery/mode');
          expect(request.body, '{"mode":"BFF"}');
          return http.Response(
            '{"activeMode":"BFF"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final mode = await api.setActiveMode('BFF');

      expect(mode, 'BFF');
    });

    test('throws DiscoveryApiException on a non-200 response', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.setActiveMode('BIZZ'), throwsA(isA<DiscoveryApiException>()));
    });
  });

  group('DiscoveryApi.setSnoozeMode', () {
    test('enabling sends the flag and an ISO-8601 until, and parses the result', () async {
      final until = DateTime.utc(2026, 1, 8);
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'PUT');
          expect(request.url.path, '/discovery/snooze');
          expect(request.body, '{"enabled":true,"until":"2026-01-08T00:00:00.000Z"}');
          return http.Response(
            '{"snoozedUntil":"2026-01-08T00:00:00.000Z"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final status = await api.setSnoozeMode(true, until: until);

      expect(status.snoozedUntil, until);
    });

    test('enabling without an until omits it from the body', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.body, '{"enabled":true}');
          return http.Response(
            '{"snoozedUntil":"2026-01-08T00:00:00.000Z"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      await api.setSnoozeMode(true);
    });

    test('enabling with a status message includes it and parses it back', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.body, '{"enabled":true,"statusMessage":"On Vacation"}');
          return http.Response(
            '{"snoozedUntil":"2026-01-08T00:00:00.000Z","statusMessage":"On Vacation"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final status = await api.setSnoozeMode(true, statusMessage: 'On Vacation');

      expect(status.statusMessage, 'On Vacation');
    });

    test('disabling sends enabled:false and parses a null snoozedUntil', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.body, '{"enabled":false}');
          return http.Response(
            '{"snoozedUntil":null}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final status = await api.setSnoozeMode(false);

      expect(status.snoozedUntil, isNull);
    });

    test('throws DiscoveryApiException when the end date is invalid', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"Snooze end time must be in the future."}',
            400,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(() => api.setSnoozeMode(true), throwsA(isA<DiscoveryApiException>()));
    });
  });

  group('DiscoveryApi.fetchSnoozeStatus', () {
    test('parses an inactive snooze', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'GET');
          expect(request.url.path, '/discovery/snooze');
          return http.Response(
            '{"snoozedUntil":null}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final status = await api.fetchSnoozeStatus();

      expect(status.snoozedUntil, isNull);
    });

    test('parses an active snooze with its status message', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"snoozedUntil":"2026-01-08T00:00:00.000Z","statusMessage":"On Vacation"}',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final status = await api.fetchSnoozeStatus();

      expect(status.snoozedUntil, DateTime.utc(2026, 1, 8));
      expect(status.statusMessage, 'On Vacation');
    });
  });

  group('DiscoveryApi.setVisibilitySchedule', () {
    test('sends the enabled flag and hour bounds, and parses the result', () async {
      http.Request? capturedRequest;
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          capturedRequest = request;
          return http.Response(
            '{"enabled":true,"hiddenStartHourUtc":9,"hiddenEndHourUtc":17}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final schedule = await api.setVisibilitySchedule(true, hiddenStartHourUtc: 9, hiddenEndHourUtc: 17);

      expect(capturedRequest!.method, 'PUT');
      expect(capturedRequest!.url.path, '/discovery/visibility-schedule');
      expect(
        capturedRequest!.body,
        '{"enabled":true,"hiddenStartHourUtc":9,"hiddenEndHourUtc":17}',
      );
      expect(schedule.enabled, isTrue);
      expect(schedule.hiddenStartHourUtc, 9);
      expect(schedule.hiddenEndHourUtc, 17);
    });

    test('disabling omits the hour bounds', () async {
      http.Request? capturedRequest;
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          capturedRequest = request;
          return http.Response(
            '{"enabled":false,"hiddenStartHourUtc":null,"hiddenEndHourUtc":null}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final schedule = await api.setVisibilitySchedule(false);

      expect(capturedRequest!.body, '{"enabled":false}');
      expect(schedule.enabled, isFalse);
      expect(schedule.hiddenStartHourUtc, isNull);
    });

    test('throws DiscoveryApiException when enabling without both hour bounds', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"hiddenStartHourUtc and hiddenEndHourUtc are required when enabling."}',
            400,
          ),
        ),
      );

      expect(() => api.setVisibilitySchedule(true), throwsA(isA<DiscoveryApiException>()));
    });
  });

  group('DiscoveryApi.fetchVisibilitySchedule', () {
    test('parses a disabled schedule', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'GET');
          expect(request.url.path, '/discovery/visibility-schedule');
          return http.Response(
            '{"enabled":false,"hiddenStartHourUtc":null,"hiddenEndHourUtc":null}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final schedule = await api.fetchVisibilitySchedule();

      expect(schedule.enabled, isFalse);
    });

    test('parses an enabled overnight window', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"enabled":true,"hiddenStartHourUtc":22,"hiddenEndHourUtc":6}',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final schedule = await api.fetchVisibilitySchedule();

      expect(schedule.enabled, isTrue);
      expect(schedule.hiddenStartHourUtc, 22);
      expect(schedule.hiddenEndHourUtc, 6);
    });
  });

  group('DiscoveryApi.fetchVideoFeed', () {
    test('parses video feed cards from a snippet', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'GET');
          expect(request.url.path, '/discovery/video-feed');
          return http.Response(
            '[{"id":"user-2","name":"Jane","age":25,'
            '"videoUrl":"https://example.com/snippet.mp4","videoSource":"SNIPPET",'
            '"promptQuestion":null}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final feed = await api.fetchVideoFeed();

      expect(feed, hasLength(1));
      expect(feed.first.id, 'user-2');
      expect(feed.first.name, 'Jane');
      expect(feed.first.age, 25);
      expect(feed.first.videoUrl, 'https://example.com/snippet.mp4');
      expect(feed.first.videoSource, 'SNIPPET');
      expect(feed.first.promptQuestion, isNull);
    });

    test('parses a prompt-answer video card with its question', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '[{"id":"user-3","name":"Sam","age":29,'
            '"videoUrl":"https://example.com/answer.mp4","videoSource":"PROMPT_ANSWER",'
            '"promptQuestion":"What is your simple pleasure?"}]',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final feed = await api.fetchVideoFeed();

      expect(feed.first.videoSource, 'PROMPT_ANSWER');
      expect(feed.first.promptQuestion, 'What is your simple pleasure?');
    });

    test('throws DiscoveryApiException on a non-200 response', () async {
      final api = DiscoveryApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchVideoFeed(), throwsA(isA<DiscoveryApiException>()));
    });
  });
}
