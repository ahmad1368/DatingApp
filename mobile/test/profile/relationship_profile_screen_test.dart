import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/profile/relationship_profile_api.dart';
import 'package:mobile/profile/relationship_profile_screen.dart';

const _catalogResponse =
    '{"relationshipStructures":["Monogamous","Polyamorous"],"kinkTags":["BDSM"],'
    '"relationshipDesires":["Marriage","Casual Dating"]}';
const _emptyProfileResponse =
    '{"relationshipStructure":null,"showRelationshipStructureOnProfile":true,'
    '"kinkTags":[],"showKinkTagsOnProfile":true,"relationshipDesires":[],'
    '"showRelationshipDesiresOnProfile":true,"customRelationshipIntent":null,'
    '"showCustomRelationshipIntentOnProfile":true,"communicationBoundaries":null,'
    '"showCommunicationBoundariesOnProfile":true}';

void main() {
  testWidgets('selecting a desire badge and saving submits the payload', (tester) async {
    tester.view.physicalSize = const Size(800, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    http.Request? putRequest;
    final api = RelationshipProfileApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile/relationship/catalog') {
          return http.Response(_catalogResponse, 200, headers: {'content-type': 'application/json'});
        }
        if (request.method == 'GET') {
          return http.Response(
            _emptyProfileResponse,
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        putRequest = request;
        return http.Response(
          _emptyProfileResponse,
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: RelationshipProfileScreen(relationshipProfileApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilterChip, 'Marriage'));
    await tester.pump();
    await tester.tap(find.widgetWithText(ChoiceChip, 'Monogamous'));
    await tester.pump();
    await tester.enterText(find.byType(TextField).first, 'Open to relocating');
    await tester.enterText(find.byType(TextField).last, 'No calls before 9am');

    await tester.tap(find.widgetWithText(ElevatedButton, 'Save'));
    await tester.pumpAndSettle();

    expect(putRequest, isNotNull);
    expect(putRequest!.url.path, '/profile/relationship');
    expect(putRequest!.body, contains('"relationshipDesires":["Marriage"]'));
    expect(putRequest!.body, contains('"relationshipStructure":"Monogamous"'));
    expect(putRequest!.body, contains('"customRelationshipIntent":"Open to relocating"'));
    expect(putRequest!.body, contains('"communicationBoundaries":"No calls before 9am"'));
    expect(find.text('Saved.'), findsOneWidget);
  });

  testWidgets('pre-fills the form from the current relationship profile', (tester) async {
    tester.view.physicalSize = const Size(800, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final api = RelationshipProfileApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile/relationship/catalog') {
          return http.Response(_catalogResponse, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"relationshipStructure":"Polyamorous","showRelationshipStructureOnProfile":false,'
          '"kinkTags":["BDSM"],"showKinkTagsOnProfile":true,"relationshipDesires":["Marriage"],'
          '"showRelationshipDesiresOnProfile":true,"customRelationshipIntent":"Long distance ok",'
          '"showCustomRelationshipIntentOnProfile":true,'
          '"communicationBoundaries":"No calls before 9am",'
          '"showCommunicationBoundariesOnProfile":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: RelationshipProfileScreen(relationshipProfileApi: api)));
    await tester.pumpAndSettle();

    expect(
      tester.widget<FilterChip>(find.widgetWithText(FilterChip, 'Marriage')).selected,
      isTrue,
    );
    expect(
      tester.widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'Polyamorous')).selected,
      isTrue,
    );
    expect(find.text('Long distance ok'), findsOneWidget);
    expect(find.text('No calls before 9am'), findsOneWidget);
  });
}
