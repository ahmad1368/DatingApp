import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/profile/gender_identity_api.dart';
import 'package:mobile/profile/gender_identity_screen.dart';

const _catalogResponse =
    '{"genderIdentities":["Woman","Man","Non-binary"],"orientations":["Straight","Queer","Bisexual"]}';

void main() {
  testWidgets('selecting options and saving submits the payload', (tester) async {
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    http.Request? capturedRequest;
    final api = GenderIdentityApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile/gender-identity/catalog') {
          return http.Response(_catalogResponse, 200, headers: {'content-type': 'application/json'});
        }
        capturedRequest = request;
        return http.Response(
          '{"genderIdentities":["Non-binary"],"customGenderDescription":null,'
          '"showGenderOnProfile":true,"orientations":["Queer"],'
          '"customOrientationDescription":null,"showOrientationOnProfile":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: GenderIdentityScreen(genderIdentityApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilterChip, 'Non-binary'));
    await tester.pump();
    await tester.tap(find.widgetWithText(FilterChip, 'Queer'));
    await tester.pump();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Save'));
    await tester.pumpAndSettle();

    expect(capturedRequest, isNotNull);
    expect(capturedRequest!.url.path, '/profile/gender-identity');
    expect(
      capturedRequest!.body,
      '{"genderIdentities":["Non-binary"],"showGenderOnProfile":true,'
      '"orientations":["Queer"],"showOrientationOnProfile":true}',
    );
    expect(find.text('Saved.'), findsOneWidget);
  });

  testWidgets('toggling visibility off is reflected in the saved payload', (tester) async {
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    http.Request? capturedRequest;
    final api = GenderIdentityApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile/gender-identity/catalog') {
          return http.Response(_catalogResponse, 200, headers: {'content-type': 'application/json'});
        }
        capturedRequest = request;
        return http.Response(
          '{"genderIdentities":[],"customGenderDescription":null,'
          '"showGenderOnProfile":false,"orientations":[],'
          '"customOrientationDescription":null,"showOrientationOnProfile":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: GenderIdentityScreen(genderIdentityApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(SwitchListTile, 'Show gender identity on my public profile'));
    await tester.pump();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Save'));
    await tester.pumpAndSettle();

    expect(capturedRequest, isNotNull);
    expect(capturedRequest!.body, contains('"showGenderOnProfile":false'));
  });
}
