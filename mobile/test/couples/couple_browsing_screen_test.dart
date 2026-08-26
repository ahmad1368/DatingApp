import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/couples/couple_browsing_screen.dart';
import 'package:mobile/couples/couples_api.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

const _partnersResponse = '[{"id":"link-1","partnerId":"user-2","partnerName":"Alex",'
    '"linkedAt":"2026-01-01T00:00:00.000Z","jointBrowsingEnabled":true},'
    '{"id":"link-2","partnerId":"user-3","partnerName":"Sam",'
    '"linkedAt":"2026-01-02T00:00:00.000Z","jointBrowsingEnabled":false}]';

void main() {
  testWidgets('shows solo selected when browsing solo', (tester) async {
    final api = CouplesApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/couples/partners') {
          return _jsonResponse(_partnersResponse, 200);
        }
        return _jsonResponse('{"activeBrowsingPartnerId":null}', 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: CoupleBrowsingScreen(couplesApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Browse Solo'), findsOneWidget);
    expect(find.text('Alex'), findsOneWidget);
    expect(find.text('Sam'), findsOneWidget);
    expect(find.text('Enable joint browsing with this partner first'), findsOneWidget);

    final soloRadio = tester.widget<RadioListTile<String?>>(
      find.ancestor(of: find.text('Browse Solo'), matching: find.byType(RadioListTile<String?>)),
    );
    expect(soloRadio.groupValue, isNull);
  });

  testWidgets('disables selecting a partner without joint browsing enabled', (tester) async {
    final api = CouplesApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/couples/partners') {
          return _jsonResponse(_partnersResponse, 200);
        }
        return _jsonResponse('{"activeBrowsingPartnerId":null}', 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: CoupleBrowsingScreen(couplesApi: api)));
    await tester.pumpAndSettle();

    final samRadio = tester.widget<RadioListTile<String?>>(
      find.ancestor(of: find.text('Sam'), matching: find.byType(RadioListTile<String?>)),
    );
    expect(samRadio.onChanged, isNull);
  });

  testWidgets('switching to an enabled partner sends the switch request', (tester) async {
    http.Request? putRequest;
    final api = CouplesApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/couples/partners') {
          return _jsonResponse(_partnersResponse, 200);
        }
        if (request.method == 'PUT') {
          putRequest = request;
          return _jsonResponse('{"activeBrowsingPartnerId":"user-2"}', 200);
        }
        return _jsonResponse('{"activeBrowsingPartnerId":null}', 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: CoupleBrowsingScreen(couplesApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Alex'));
    await tester.pumpAndSettle();

    expect(putRequest, isNotNull);
    expect(putRequest!.body, '{"partnerId":"user-2"}');

    final aliceRadio = tester.widget<RadioListTile<String?>>(
      find.ancestor(of: find.text('Alex'), matching: find.byType(RadioListTile<String?>)),
    );
    expect(aliceRadio.groupValue, 'user-2');
  });
}
