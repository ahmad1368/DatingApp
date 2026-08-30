import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/speed_dating/speed_dating_api.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

const _noneStatusResponse = '{"status":"NONE","roundId":null,"endsAt":null,'
    '"myDecision":null,"otherDecided":false,"matched":false}';

void main() {
  group('SpeedDatingApi.fetchSchedule', () {
    test('sends the bearer token and parses the schedule', () async {
      final api = SpeedDatingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/speed-dating/schedule');
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          return _jsonResponse(
            '{"live":true,"dayOfWeek":3,"startHourUtc":19,"endHourUtc":20}',
            200,
          );
        }),
      );

      final schedule = await api.fetchSchedule();

      expect(schedule.live, isTrue);
      expect(schedule.dayOfWeek, 3);
      expect(schedule.startHourUtc, 19);
      expect(schedule.endHourUtc, 20);
    });

    test('throws SpeedDatingApiException on a non-200 response', () async {
      final api = SpeedDatingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchSchedule(), throwsA(isA<SpeedDatingApiException>()));
    });
  });

  group('SpeedDatingApi.fetchStatus', () {
    test('parses NONE status', () async {
      final api = SpeedDatingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/speed-dating/status');
          return _jsonResponse(_noneStatusResponse, 200);
        }),
      );

      final status = await api.fetchStatus();

      expect(status.status, 'NONE');
      expect(status.roundId, isNull);
    });

    test('parses an IN_ROUND status', () async {
      final api = SpeedDatingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse(
            '{"status":"IN_ROUND","roundId":"round-1","endsAt":"2026-01-01T00:03:00.000Z",'
            '"myDecision":null,"otherDecided":false,"matched":false}',
            200,
          ),
        ),
      );

      final status = await api.fetchStatus();

      expect(status.isInRound, isTrue);
      expect(status.roundId, 'round-1');
    });

    test('throws SpeedDatingApiException on a non-200 response', () async {
      final api = SpeedDatingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchStatus(), throwsA(isA<SpeedDatingApiException>()));
    });
  });

  group('SpeedDatingApi.joinQueue', () {
    test('sends a POST and parses WAITING status', () async {
      final api = SpeedDatingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/speed-dating/queue/join');
          return _jsonResponse(
            '{"status":"WAITING","roundId":null,"endsAt":null,'
            '"myDecision":null,"otherDecided":false,"matched":false}',
            200,
          );
        }),
      );

      final status = await api.joinQueue();

      expect(status.isWaiting, isTrue);
    });

    test('throws SpeedDatingApiException outside the event window', () async {
      final api = SpeedDatingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse(
            '{"message":"Speed Dating is only open during its scheduled weekly window."}',
            400,
          ),
        ),
      );

      expect(() => api.joinQueue(), throwsA(isA<SpeedDatingApiException>()));
    });
  });

  group('SpeedDatingApi.leaveQueue', () {
    test('sends a POST to leave the queue', () async {
      http.Request? capturedRequest;
      final api = SpeedDatingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          capturedRequest = request;
          return http.Response('', 200);
        }),
      );

      await api.leaveQueue();

      expect(capturedRequest, isNotNull);
      expect(capturedRequest!.url.path, '/speed-dating/queue/leave');
    });
  });

  group('SpeedDatingApi.decideRound', () {
    test('sends wantsMatch and parses the updated status', () async {
      http.Request? capturedRequest;
      final api = SpeedDatingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          capturedRequest = request;
          return _jsonResponse(
            '{"status":"IN_ROUND","roundId":"round-1","endsAt":"2026-01-01T00:03:00.000Z",'
            '"myDecision":true,"otherDecided":false,"matched":false}',
            200,
          );
        }),
      );

      final status = await api.decideRound(roundId: 'round-1', wantsMatch: true);

      expect(capturedRequest!.method, 'POST');
      expect(capturedRequest!.url.path, '/speed-dating/rounds/round-1/decision');
      expect(capturedRequest!.body, '{"wantsMatch":true}');
      expect(status.myDecision, isTrue);
    });

    test('reports a mutual match once both sides decide', () async {
      final api = SpeedDatingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse(
            '{"status":"IN_ROUND","roundId":"round-1","endsAt":"2026-01-01T00:03:00.000Z",'
            '"myDecision":true,"otherDecided":true,"matched":true}',
            200,
          ),
        ),
      );

      final status = await api.decideRound(roundId: 'round-1', wantsMatch: true);

      expect(status.matched, isTrue);
    });
  });
}
