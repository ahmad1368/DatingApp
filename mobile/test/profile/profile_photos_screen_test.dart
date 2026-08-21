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

void main() {
  testWidgets('shows an empty state when there are no profile photos', (tester) async {
    final api = ProfilePhotosApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response('[]', 200, headers: {'content-type': 'application/json'}),
      ),
    );

    await tester.pumpWidget(MaterialApp(home: ProfilePhotosScreen(profilePhotosApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('No profile photos yet. Add one to get started.'), findsOneWidget);
  });

  testWidgets('lists photos and highlights the lead photo with its conversion rate', (tester) async {
    final api = ProfilePhotosApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response(
          '[{"id":"photo-1","mediaUrl":"https://example.com/a.jpg","isLead":true,'
          '"impressions":10,"rightSwipes":4,"conversionRate":0.4}]',
          200,
          headers: {'content-type': 'application/json'},
        ),
      ),
    );

    await tester.pumpWidget(MaterialApp(home: ProfilePhotosScreen(profilePhotosApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Lead photo'), findsOneWidget);
    expect(find.textContaining('40% right-swipes'), findsOneWidget);
  });

  testWidgets('adding a photo picks and uploads it', (tester) async {
    http.Request? addRequest;
    var fetchCount = 0;
    final api = ProfilePhotosApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'POST' && request.url.path == '/profile-photos') {
          addRequest = request;
          return http.Response(
            '{"id":"photo-1","mediaUrl":"file:///tmp/photo.jpg","isLead":true,'
            '"impressions":0,"rightSwipes":0,"conversionRate":null}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }
        fetchCount += 1;
        final body = fetchCount == 1
            ? '[]'
            : '[{"id":"photo-1","mediaUrl":"file:///tmp/photo.jpg","isLead":true,'
                '"impressions":0,"rightSwipes":0,"conversionRate":null}]';
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
        if (request.method == 'DELETE') {
          deleteRequest = request;
          return http.Response('', 200);
        }
        return http.Response(
          '[{"id":"photo-1","mediaUrl":"https://example.com/a.jpg","isLead":true,'
          '"impressions":0,"rightSwipes":0,"conversionRate":null}]',
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
}
