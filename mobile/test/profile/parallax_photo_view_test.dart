import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile/profile/parallax_photo_view.dart';
import 'package:mobile/profile/tilt_sensor_controller.dart';

class FakeTiltSensorController implements TiltSensorController {
  final _controller = StreamController<TiltReading>.broadcast();

  @override
  Stream<TiltReading> get tiltStream => _controller.stream;

  void emit(TiltReading reading) => _controller.add(reading);

  void dispose() => _controller.close();
}

dynamic _translationOf(WidgetTester tester) =>
    tester.widgetList<Transform>(find.byType(Transform)).first.transform.getTranslation();

void main() {
  testWidgets('shifts the photo opposite the tilt direction', (tester) async {
    final sensor = FakeTiltSensorController();
    addTearDown(sensor.dispose);

    await tester.pumpWidget(
      MaterialApp(
        home: ParallaxPhotoView(imageUrl: 'https://example.com/photo.jpg', sensor: sensor),
      ),
    );
    await tester.pump();

    final initialOffset = _translationOf(tester);
    expect(initialOffset.x, 0);
    expect(initialOffset.y, 0);

    sensor.emit(const TiltReading(x: 5, y: 0));
    await tester.pumpAndSettle();

    final tiltedOffset = _translationOf(tester);
    // A positive x tilt shifts the photo left (negative x offset), so it
    // appears to lag behind the tilt rather than move with it.
    expect(tiltedOffset.x, lessThan(0));
  });

  testWidgets('clamps the offset at the configured maximum', (tester) async {
    final sensor = FakeTiltSensorController();
    addTearDown(sensor.dispose);

    await tester.pumpWidget(
      MaterialApp(
        home: ParallaxPhotoView(
          imageUrl: 'https://example.com/photo.jpg',
          sensor: sensor,
          maxOffset: 10,
        ),
      ),
    );
    await tester.pump();

    sensor.emit(const TiltReading(x: 50, y: -50));
    await tester.pumpAndSettle();

    final offset = _translationOf(tester);
    expect(offset.x.abs(), lessThanOrEqualTo(10));
    expect(offset.y.abs(), lessThanOrEqualTo(10));
  });
}
