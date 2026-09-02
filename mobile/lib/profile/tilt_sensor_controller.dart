import 'package:sensors_plus/sensors_plus.dart';

/// A device tilt reading, used to drive the 3D parallax effect on a profile
/// photo (see ParallaxPhotoView). Mirrors the raw accelerometer x/y axes -
/// roughly 0 at rest, growing toward ±10 (m/s^2) as the phone tilts
/// side-to-side (x) or front-to-back (y).
class TiltReading {
  const TiltReading({required this.x, required this.y});

  final double x;
  final double y;
}

/// Streams device tilt. Abstracted so tests and any platform without a
/// real accelerometer can avoid the actual sensor/platform channel.
abstract class TiltSensorController {
  Stream<TiltReading> get tiltStream;
}

class DeviceTiltSensorController implements TiltSensorController {
  @override
  Stream<TiltReading> get tiltStream =>
      accelerometerEventStream().map((event) => TiltReading(x: event.x, y: event.y));
}
