import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/profile/profile_photo_picker_controller.dart';
import 'package:mobile/profile/profile_photos_api.dart';
import 'package:mobile/profile/profile_photos_screen.dart';

class _FakePicker implements ProfilePhotoPickerController {
  String? nextPath = 'file:///tmp/photo.jpg';

  @override
  Future<String?> pickPhoto() async => nextPath;
}

http.Response _blurResponse([bool enabled = false]) => http.Response(
      '{"blurPhotosUntilMatch":$enabled}',
      200,
      headers: {'content-type': 'application/json'},
    );

void main() {
  testWidgets('shows an empty state when there are no profile photos', (tester) async {
    final api = ProfilePhotosApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile-photos/blur-until-match') {
          return _blurResponse();
        }
        return http.Response('[]', 200, headers: {'content-type': 'application/json'});
      }),
    );

    await tester.pumpWidget(MaterialApp(home: ProfilePhotosScreen(profilePhotosApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('No profile photos yet. Add one to get started.'), findsOneWidget);
  });

  testWidgets('lists photos and highlights the lead photo with its conversion rate', (tester) async {
    final api = ProfilePhotosApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile-photos/blur-until-match') {
          return _blurResponse();
        }
        return http.Response(
          '[{"id":"photo-1","mediaUrl":"https://example.com/a.jpg","isLead":true,'
          '"impressions":10,"rightSwipes":4,"conversionRate":0.4,"qualityScore":39,'
          '"cropFocalX":0.5,"cropFocalY":0.35,"brightnessAdjustment":0}]',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: ProfilePhotosScreen(profilePhotosApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Lead photo'), findsOneWidget);
    expect(find.textContaining('40% right-swipes'), findsOneWidget);
    expect(find.textContaining('Quality score: 39'), findsOneWidget);

    final thumbnail = tester.widget<Image>(find.byType(Image));
    final alignment = thumbnail.alignment as Alignment;
    expect(alignment.x, closeTo(0.0, 0.0001));
    expect(alignment.y, closeTo(-0.3, 0.0001));
  });

  testWidgets('shows the suggested brightness adjustment when non-zero', (tester) async {
    final api = ProfilePhotosApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile-photos/blur-until-match') {
          return _blurResponse();
        }
        return http.Response(
          '[{"id":"photo-1","mediaUrl":"https://example.com/a.jpg","isLead":true,'
          '"impressions":0,"rightSwipes":0,"conversionRate":null,"qualityScore":39,'
          '"cropFocalX":0.5,"cropFocalY":0.35,"brightnessAdjustment":12}]',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: ProfilePhotosScreen(profilePhotosApi: api)));
    await tester.pumpAndSettle();

    expect(find.textContaining('Suggest 12% brighter'), findsOneWidget);
  });

  testWidgets('adding a photo picks and uploads it', (tester) async {
    http.Request? addRequest;
    var fetchCount = 0;
    final api = ProfilePhotosApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile-photos/blur-until-match') {
          return _blurResponse();
        }
        if (request.method == 'POST' && request.url.path == '/profile-photos') {
          addRequest = request;
          return http.Response(
            '{"id":"photo-1","mediaUrl":"file:///tmp/photo.jpg","isLead":true,'
            '"impressions":0,"rightSwipes":0,"conversionRate":null,"qualityScore":39,'
            '"cropFocalX":0.5,"cropFocalY":0.35,"brightnessAdjustment":0}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }
        fetchCount += 1;
        final body = fetchCount == 1
            ? '[]'
            : '[{"id":"photo-1","mediaUrl":"file:///tmp/photo.jpg","isLead":true,'
                '"impressions":0,"rightSwipes":0,"conversionRate":null,"qualityScore":39,'
                '"cropFocalX":0.5,"cropFocalY":0.35,"brightnessAdjustment":0}]';
        return http.Response(body, 200, headers: {'content-type': 'application/json'});
      }),
    );

    await tester.pumpWidget(
      MaterialApp(home: ProfilePhotosScreen(profilePhotosApi: api, picker: _FakePicker())),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.add_a_photo));
    await tester.pumpAndSettle();

    expect(addRequest, isNotNull);
    expect(addRequest!.body, '{"mediaUrl":"file:///tmp/photo.jpg"}');
    expect(find.text('Lead photo'), findsOneWidget);
  });

  testWidgets('deleting a photo removes it from the list', (tester) async {
    http.Request? deleteRequest;
    final api = ProfilePhotosApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile-photos/blur-until-match') {
          return _blurResponse();
        }
        if (request.method == 'DELETE') {
          deleteRequest = request;
          return http.Response('', 200);
        }
        return http.Response(
          '[{"id":"photo-1","mediaUrl":"https://example.com/a.jpg","isLead":true,'
          '"impressions":0,"rightSwipes":0,"conversionRate":null,"qualityScore":39,'
          '"cropFocalX":0.5,"cropFocalY":0.35,"brightnessAdjustment":0}]',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: ProfilePhotosScreen(profilePhotosApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.delete));
    await tester.pumpAndSettle();

    expect(deleteRequest, isNotNull);
    expect(deleteRequest!.url.path, '/profile-photos/photo-1');
    expect(find.text('No profile photos yet. Add one to get started.'), findsOneWidget);
  });

  testWidgets('editing a caption saves it and shows it under the photo', (tester) async {
    http.Request? putRequest;
    final api = ProfilePhotosApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile-photos/blur-until-match') {
          return _blurResponse();
        }
        if (request.method == 'PUT' && request.url.path == '/profile-photos/photo-1/caption') {
          putRequest = request;
          return http.Response(
            '{"id":"photo-1","mediaUrl":"https://example.com/a.jpg","isLead":true,'
            '"impressions":0,"rightSwipes":0,"conversionRate":null,"qualityScore":39,'
            '"cropFocalX":0.5,"cropFocalY":0.35,"brightnessAdjustment":0,"caption":"Hiking last summer"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '[{"id":"photo-1","mediaUrl":"https://example.com/a.jpg","isLead":true,'
          '"impressions":0,"rightSwipes":0,"conversionRate":null,"qualityScore":39,'
          '"cropFocalX":0.5,"cropFocalY":0.35,"brightnessAdjustment":0}]',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: ProfilePhotosScreen(profilePhotosApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.edit_note));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'Hiking last summer');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    expect(putRequest, isNotNull);
    expect(putRequest!.body, '{"caption":"Hiking last summer"}');
    expect(find.textContaining('Hiking last summer'), findsOneWidget);
  });

  testWidgets('tapping the parallax preview icon opens the tilt-to-preview screen', (tester) async {
    final api = ProfilePhotosApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile-photos/blur-until-match') {
          return _blurResponse();
        }
        return http.Response(
          '[{"id":"photo-1","mediaUrl":"https://example.com/a.jpg","isLead":true,'
          '"impressions":0,"rightSwipes":0,"conversionRate":null,"qualityScore":39,'
          '"cropFocalX":0.5,"cropFocalY":0.35,"brightnessAdjustment":0}]',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: ProfilePhotosScreen(profilePhotosApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.view_in_ar));
    await tester.pump();
    await tester.pump();

    expect(find.text('Tilt your phone to preview'), findsOneWidget);
  });

  testWidgets('tapping the AI reorder action re-ranks photos by quality score', (tester) async {
    http.Request? reorderRequest;
    final api = ProfilePhotosApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile-photos/blur-until-match') {
          return _blurResponse();
        }
        if (request.method == 'POST' && request.url.path == '/profile-photos/reorder-by-quality') {
          reorderRequest = request;
          return http.Response(
            '[{"id":"photo-2","mediaUrl":"https://example.com/b.jpg","isLead":true,'
            '"impressions":0,"rightSwipes":0,"conversionRate":null,"qualityScore":98,'
            '"cropFocalX":0.4,"cropFocalY":0.3,"brightnessAdjustment":0},'
            '{"id":"photo-1","mediaUrl":"https://example.com/a.jpg","isLead":false,'
            '"impressions":10,"rightSwipes":4,"conversionRate":0.4,"qualityScore":39,'
            '"cropFocalX":0.5,"cropFocalY":0.35,"brightnessAdjustment":0}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '[{"id":"photo-1","mediaUrl":"https://example.com/a.jpg","isLead":true,'
          '"impressions":10,"rightSwipes":4,"conversionRate":0.4,"qualityScore":39,'
          '"cropFocalX":0.5,"cropFocalY":0.35,"brightnessAdjustment":0},'
          '{"id":"photo-2","mediaUrl":"https://example.com/b.jpg","isLead":false,'
          '"impressions":0,"rightSwipes":0,"conversionRate":null,"qualityScore":98,'
          '"cropFocalX":0.4,"cropFocalY":0.3,"brightnessAdjustment":0}]',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: ProfilePhotosScreen(profilePhotosApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.auto_awesome));
    await tester.pumpAndSettle();

    expect(reorderRequest, isNotNull);
    expect(find.textContaining('Quality score: 98'), findsOneWidget);
  });

  testWidgets('shows curation suggestions and deletes the flagged photo on tap', (tester) async {
    http.Request? deleteRequest;
    final api = ProfilePhotosApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile-photos/blur-until-match') {
          return _blurResponse();
        }
        if (request.url.path == '/profile-photos/curation-suggestions') {
          return http.Response(
            '{"suggestedRemovals":[{"photoId":"photo-1","mediaUrl":"https://example.com/a.jpg",'
            '"reasons":["BLURRY"]}],"suggestedOrder":["photo-1"]}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.method == 'DELETE') {
          deleteRequest = request;
          return http.Response('{}', 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '[{"id":"photo-1","mediaUrl":"https://example.com/a.jpg","isLead":true,'
          '"impressions":0,"rightSwipes":0,"conversionRate":null,"qualityScore":10,'
          '"cropFocalX":0.5,"cropFocalY":0.35,"brightnessAdjustment":0}]',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: ProfilePhotosScreen(profilePhotosApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.auto_fix_high));
    await tester.pumpAndSettle();

    expect(find.text('Suggested cleanup'), findsOneWidget);
    expect(find.text('Blurry'), findsOneWidget);

    await tester.tap(find.text('Remove'));
    await tester.pumpAndSettle();

    expect(deleteRequest, isNotNull);
    expect(deleteRequest!.url.path, '/profile-photos/photo-1');
    expect(find.text('No profile photos yet. Add one to get started.'), findsOneWidget);
  });

  testWidgets('shows a confirmation when the curator finds nothing to clean up', (tester) async {
    final api = ProfilePhotosApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile-photos/blur-until-match') {
          return _blurResponse();
        }
        if (request.url.path == '/profile-photos/curation-suggestions') {
          return http.Response(
            '{"suggestedRemovals":[],"suggestedOrder":["photo-1"]}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '[{"id":"photo-1","mediaUrl":"https://example.com/a.jpg","isLead":true,'
          '"impressions":0,"rightSwipes":0,"conversionRate":null,"qualityScore":90,'
          '"cropFocalX":0.5,"cropFocalY":0.35,"brightnessAdjustment":0}]',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: ProfilePhotosScreen(profilePhotosApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.auto_fix_high));
    await tester.pumpAndSettle();

    expect(find.text('Your gallery looks great - nothing to clean up.'), findsOneWidget);
    expect(find.text('Suggested cleanup'), findsNothing);
  });

  testWidgets('toggling blur until match sends the updated preference', (tester) async {
    http.Request? putRequest;
    final api = ProfilePhotosApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'PUT' && request.url.path == '/profile-photos/blur-until-match') {
          putRequest = request;
          return _blurResponse(true);
        }
        if (request.url.path == '/profile-photos/blur-until-match') {
          return _blurResponse();
        }
        return http.Response('[]', 200, headers: {'content-type': 'application/json'});
      }),
    );

    await tester.pumpWidget(MaterialApp(home: ProfilePhotosScreen(profilePhotosApi: api)));
    await tester.pumpAndSettle();

    final switchTileBefore = tester.widget<SwitchListTile>(find.byType(SwitchListTile));
    expect(switchTileBefore.value, isFalse);

    await tester.tap(find.byType(SwitchListTile));
    await tester.pumpAndSettle();

    expect(putRequest, isNotNull);
    expect(putRequest!.body, '{"enabled":true}');
    final switchTileAfter = tester.widget<SwitchListTile>(find.byType(SwitchListTile));
    expect(switchTileAfter.value, isTrue);
  });
}
