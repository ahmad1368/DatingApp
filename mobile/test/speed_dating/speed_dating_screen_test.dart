import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/speed_dating/speed_dating_api.dart';
import 'package:mobile/speed_dating/speed_dating_screen.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

const _liveScheduleResponse = '{"live":true,"dayOfWeek":3,"startHourUtc":19,"endHourUtc":20}';
const _closedScheduleResponse = '{"live":false,"dayOfWeek":3,"startHourUtc":19,"endHourUtc":20}';
const _noneStatusResponse = '{"status":"NONE","roundId":null,"endsAt":null,'
    '"myDecision":null,"otherDecided":false,"matched":false}';

void main() {
  testWidgets('shows a disabled join button when the event is not live', (tester) async {
    final api = SpeedDatingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/speed-dating/schedule') {
          return _jsonResponse(_closedScheduleResponse, 200);
        }
        return _jsonResponse(_noneStatusResponse, 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SpeedDatingScreen(speedDatingApi: api)));
    await tester.pump();

    final button = tester.widget<ElevatedButton>(find.widgetWithText(ElevatedButton, 'Join Speed Dating'));
    expect(button.onPressed, isNull);
    expect(find.textContaining('Next window: Wednesday'), findsOneWidget);
  });

  testWidgets('joining the queue shows the waiting state', (tester) async {
    final api = SpeedDatingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/speed-dating/schedule') {
          return _jsonResponse(_liveScheduleResponse, 200);
        }
        if (request.method == 'POST' && request.url.path == '/speed-dating/queue/join') {
          return _jsonResponse(
            '{"status":"WAITING","roundId":null,"endsAt":null,'
            '"myDecision":null,"otherDecided":false,"matched":false}',
            200,
          );
        }
        return _jsonResponse(_noneStatusResponse, 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SpeedDatingScreen(speedDatingApi: api)));
    await tester.pump();

    await tester.tap(find.text('Join Speed Dating'));
    await tester.pump();

    expect(find.text('Waiting for a partner…'), findsOneWidget);
  });

  testWidgets('shows the round timer and decision buttons while in a round', (tester) async {
    final endsAt = DateTime.now().toUtc().add(const Duration(minutes: 2)).toIso8601String();
    final api = SpeedDatingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/speed-dating/schedule') {
          return _jsonResponse(_liveScheduleResponse, 200);
        }
        if (request.url.path == '/speed-dating/status') {
          return _jsonResponse(
            '{"status":"IN_ROUND","roundId":"round-1","endsAt":"$endsAt",'
            '"myDecision":null,"otherDecided":false,"matched":false}',
            200,
          );
        }
        return _jsonResponse(_noneStatusResponse, 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SpeedDatingScreen(speedDatingApi: api)));
    await tester.pump();

    expect(find.text('🎙️ Anonymous voice room'), findsOneWidget);
    expect(find.text('Pass'), findsOneWidget);
    expect(find.text('Match'), findsOneWidget);
  });

  testWidgets('deciding to match shows the waiting-on-other-side message', (tester) async {
    final endsAt = DateTime.now().toUtc().add(const Duration(minutes: 2)).toIso8601String();
    final api = SpeedDatingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/speed-dating/schedule') {
          return _jsonResponse(_liveScheduleResponse, 200);
        }
        if (request.method == 'POST' && request.url.path == '/speed-dating/rounds/round-1/decision') {
          return _jsonResponse(
            '{"status":"IN_ROUND","roundId":"round-1","endsAt":"$endsAt",'
            '"myDecision":true,"otherDecided":false,"matched":false}',
            200,
          );
        }
        if (request.url.path == '/speed-dating/status') {
          return _jsonResponse(
            '{"status":"IN_ROUND","roundId":"round-1","endsAt":"$endsAt",'
            '"myDecision":null,"otherDecided":false,"matched":false}',
            200,
          );
        }
        return _jsonResponse(_noneStatusResponse, 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SpeedDatingScreen(speedDatingApi: api)));
    await tester.pump();

    await tester.tap(find.text('Match'));
    await tester.pump();

    expect(find.text('Waiting for the other person to decide…'), findsOneWidget);
  });

  testWidgets('shows a matched result once the round has ended', (tester) async {
    final api = SpeedDatingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/speed-dating/schedule') {
          return _jsonResponse(_liveScheduleResponse, 200);
        }
        if (request.url.path == '/speed-dating/status') {
          return _jsonResponse(
            '{"status":"ENDED","roundId":"round-1","endsAt":"2026-01-01T00:03:00.000Z",'
            '"myDecision":true,"otherDecided":true,"matched":true}',
            200,
          );
        }
        return _jsonResponse(_noneStatusResponse, 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SpeedDatingScreen(speedDatingApi: api)));
    await tester.pump();

    expect(find.text('You matched! 🎉'), findsOneWidget);
  });
}
