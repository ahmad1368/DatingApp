import 'dart:async';

import 'package:flutter/material.dart';

import 'tilt_sensor_controller.dart';

/// "Profile Photo Depth & 3D Parallax Effect": shifts and slightly
/// over-scales a photo as the device tilts, giving it a sense of depth.
/// There's no real depth-from-single-image ML in this codebase (same
/// stand-in approach as ProfilePhotosService's scorePhotoQuality/
/// detectFaceFocalPoint) - this simulates the effect with a single-layer
/// translation around the photo's existing AI-detected focal point
/// (cropFocalX/Y) rather than a true multi-layer depth map.
class ParallaxPhotoView extends StatefulWidget {
  ParallaxPhotoView({
    super.key,
    required this.imageUrl,
    this.focalX = 0.5,
    this.focalY = 0.35,
    this.maxOffset = 14.0,
    TiltSensorController? sensor,
  }) : sensor = sensor ?? DeviceTiltSensorController();

  final String imageUrl;
  final double focalX;
  final double focalY;

  /// Maximum shift, in logical pixels, at full tilt.
  final double maxOffset;
  final TiltSensorController sensor;

  @override
  State<ParallaxPhotoView> createState() => _ParallaxPhotoViewState();
}

class _ParallaxPhotoViewState extends State<ParallaxPhotoView> {
  static const double _maxTiltMs2 = 10.0;

  StreamSubscription<TiltReading>? _subscription;
  double _offsetX = 0;
  double _offsetY = 0;

  @override
  void initState() {
    super.initState();
    _subscription = widget.sensor.tiltStream.listen(_onTilt);
  }

  void _onTilt(TiltReading reading) {
    final normalizedX = (reading.x.clamp(-_maxTiltMs2, _maxTiltMs2)) / _maxTiltMs2;
    final normalizedY = (reading.y.clamp(-_maxTiltMs2, _maxTiltMs2)) / _maxTiltMs2;
    setState(() {
      // Inverted so the photo appears to lag behind the tilt direction,
      // like a physical card with depth rather than moving with the phone.
      _offsetX = -normalizedX * widget.maxOffset;
      _offsetY = normalizedY * widget.maxOffset;
    });
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ClipRect(
      child: Transform.translate(
        offset: Offset(_offsetX, _offsetY),
        child: Transform.scale(
          // Slightly over-scaled so the translated image never reveals an
          // edge/gap at the container's border.
          scale: 1.1,
          alignment: FractionalOffset(widget.focalX, widget.focalY),
          child: Image.network(
            widget.imageUrl,
            fit: BoxFit.cover,
            errorBuilder: (context, error, stackTrace) => const Icon(Icons.image_outlined),
          ),
        ),
      ),
    );
  }
}
