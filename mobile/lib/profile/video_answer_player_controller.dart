import 'dart:io';

import 'package:video_player/video_player.dart' as vp;

/// Plays back a recorded video prompt answer for preview. Abstracted so
/// tests can avoid the real video platform channel.
abstract class VideoAnswerPlayerController {
  Future<void> play(String path);
  Future<void> stop();
}

class DeviceVideoAnswerPlayerController implements VideoAnswerPlayerController {
  vp.VideoPlayerController? _controller;

  @override
  Future<void> play(String path) async {
    await _controller?.dispose();
    final controller = vp.VideoPlayerController.file(File(path));
    await controller.initialize();
    await controller.play();
    _controller = controller;
  }

  @override
  Future<void> stop() async {
    await _controller?.pause();
  }
}
