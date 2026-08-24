import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/notifications/notifications_api.dart';

void main() {
  group('NotificationsApi.fetchNotifications', () {
    test('sends the bearer token and parses the feed', () async {
      final api = NotificationsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'GET');
          expect(request.url.path, '/notifications');
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          return http.Response(
            '{"notifications":[{"id":"n1","type":"NEW_MATCH","title":"It\'s a match!",'
            '"body":"You have a new match.","data":{"matchId":"match-1"},"read":false,'
            '"createdAt":"2026-01-01T00:00:00.000Z"}],"unreadCount":1}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final feed = await api.fetchNotifications();

      expect(feed.unreadCount, 1);
      expect(feed.notifications, hasLength(1));
      expect(feed.notifications.first.title, "It's a match!");
      expect(feed.notifications.first.read, isFalse);
      expect(feed.notifications.first.data, {'matchId': 'match-1'});
    });

    test('throws NotificationsApiException on a non-200 response', () async {
      final api = NotificationsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchNotifications(), throwsA(isA<NotificationsApiException>()));
    });
  });

  group('NotificationsApi.markRead', () {
    test('sends a PUT and parses the updated notification', () async {
      final api = NotificationsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'PUT');
          expect(request.url.path, '/notifications/n1/read');
          return http.Response(
            '{"id":"n1","type":"NEW_MATCH","title":"It\'s a match!","body":"You have a new match.",'
            '"data":null,"read":true,"createdAt":"2026-01-01T00:00:00.000Z"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final notification = await api.markRead('n1');

      expect(notification.read, isTrue);
      expect(notification.data, isNull);
    });

    test('throws NotificationsApiException on a non-200 response', () async {
      final api = NotificationsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('{"message":"Notification not found."}', 404)),
      );

      expect(() => api.markRead('missing'), throwsA(isA<NotificationsApiException>()));
    });
  });

  group('NotificationsApi.markAllRead', () {
    test('sends a PUT to read-all and parses the updated count', () async {
      final api = NotificationsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/notifications/read-all');
          return http.Response('{"updated":3}', 200, headers: {'content-type': 'application/json'});
        }),
      );

      final updated = await api.markAllRead();

      expect(updated, 3);
    });
  });

  group('NotificationsApi.registerDeviceToken', () {
    test('sends the token and platform', () async {
      final api = NotificationsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/notifications/device-tokens');
          expect(request.body, '{"token":"expo-token-1","platform":"IOS"}');
          return http.Response('{"registered":true}', 201, headers: {'content-type': 'application/json'});
        }),
      );

      await api.registerDeviceToken(token: 'expo-token-1', platform: 'IOS');
    });

    test('throws NotificationsApiException on a non-201 response', () async {
      final api = NotificationsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 400)),
      );

      expect(
        () => api.registerDeviceToken(token: 'bad', platform: 'NOT_A_PLATFORM'),
        throwsA(isA<NotificationsApiException>()),
      );
    });
  });

  group('NotificationsApi.removeDeviceToken', () {
    test('sends a DELETE for the given token', () async {
      final api = NotificationsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'DELETE');
          expect(request.url.path, '/notifications/device-tokens/expo-token-1');
          return http.Response('{"removed":true}', 200, headers: {'content-type': 'application/json'});
        }),
      );

      await api.removeDeviceToken('expo-token-1');
    });

    test('throws NotificationsApiException on a non-200 response', () async {
      final api = NotificationsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 404)),
      );

      expect(() => api.removeDeviceToken('missing'), throwsA(isA<NotificationsApiException>()));
    });
  });
}
