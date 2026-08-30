import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/gifting/gifting_api.dart';

void main() {
  group('GiftingApi.fetchCatalog', () {
    test('sends the bearer token and parses the catalog', () async {
      final api = GiftingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/gifting/catalog');
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          return http.Response(
            '[{"id":"rose","name":"Rose","emoji":"🌹","tokenCost":10}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final catalog = await api.fetchCatalog();

      expect(catalog, hasLength(1));
      expect(catalog.first.id, 'rose');
      expect(catalog.first.tokenCost, 10);
      expect(catalog.first.animated, isFalse);
    });

    test('parses the animated flag when present', () async {
      final api = GiftingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '[{"id":"crown","name":"Crown","emoji":"👑","tokenCost":250,"animated":true}]',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final catalog = await api.fetchCatalog();

      expect(catalog.first.animated, isTrue);
    });

    test('throws GiftingApiException on a non-200 response', () async {
      final api = GiftingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchCatalog(), throwsA(isA<GiftingApiException>()));
    });
  });

  group('GiftingApi.fetchBalance', () {
    test('parses the token balance', () async {
      final api = GiftingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"tokenBalance":90}',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final balance = await api.fetchBalance();

      expect(balance, 90);
    });
  });

  group('GiftingApi.sendGift', () {
    test('sends the recipient, gift, and optional message, parsing the new balance', () async {
      final api = GiftingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/gifting/send');
          expect(
            request.body,
            '{"recipientId":"user-2","giftId":"rose","message":"For you!"}',
          );
          return http.Response(
            '{"tokenBalance":90,"transaction":{"id":"gift-1",'
            '"gift":{"id":"rose","name":"Rose","emoji":"🌹","tokenCost":10},'
            '"message":"For you!","createdAt":"2026-01-01T00:00:00.000Z",'
            '"otherUserId":"user-2","otherUserName":"Alex","otherUserPhotoUrl":null}}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final balance = await api.sendGift(
        recipientId: 'user-2',
        giftId: 'rose',
        message: 'For you!',
      );

      expect(balance, 90);
    });

    test('omits the message when not provided', () async {
      final api = GiftingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.body, '{"recipientId":"user-2","giftId":"rose"}');
          return http.Response(
            '{"tokenBalance":90,"transaction":{"id":"gift-1",'
            '"gift":{"id":"rose","name":"Rose","emoji":"🌹","tokenCost":10},'
            '"message":null,"createdAt":"2026-01-01T00:00:00.000Z",'
            '"otherUserId":"user-2","otherUserName":null,"otherUserPhotoUrl":null}}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      await api.sendGift(recipientId: 'user-2', giftId: 'rose');
    });

    test('throws GiftingApiException when the balance is too low', () async {
      final api = GiftingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"Not enough gift tokens for this gift."}',
            400,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(
        () => api.sendGift(recipientId: 'user-2', giftId: 'crown'),
        throwsA(isA<GiftingApiException>()),
      );
    });
  });

  group('GiftingApi.fetchReceivedGifts', () {
    test('parses the received-gifts history', () async {
      final api = GiftingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/gifting/received');
          return http.Response(
            '[{"id":"gift-1","gift":{"id":"rose","name":"Rose","emoji":"🌹","tokenCost":10},'
            '"message":null,"createdAt":"2026-01-01T00:00:00.000Z",'
            '"otherUserId":"user-2","otherUserName":"Alex","otherUserPhotoUrl":null}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final gifts = await api.fetchReceivedGifts();

      expect(gifts, hasLength(1));
      expect(gifts.first.gift.name, 'Rose');
      expect(gifts.first.otherUserName, 'Alex');
    });
  });

  group('GiftingApi.fetchSentGifts', () {
    test('parses the sent-gifts history', () async {
      final api = GiftingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/gifting/sent');
          return http.Response('[]', 200, headers: {'content-type': 'application/json'});
        }),
      );

      final gifts = await api.fetchSentGifts();

      expect(gifts, isEmpty);
    });
  });
}
