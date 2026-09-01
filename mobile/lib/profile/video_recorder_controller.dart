import 'dart:io';

import 'package:image_picker/image_picker.dart';
import 'package:video_player/video_player.dart' as vp;

/// Mirrors the backend's server-enforced MAX_PROMPT_VIDEO_SECONDS cap
/// (backend/src/profile-prompts/profile-prompts.constants.ts).
const int maxPromptVideoSeconds = 15;

class RecordedVideo {
  RecordedVideo({required this.path, required this.durationSeconds});

  final String path;
  final int durationSeconds;
}

/// Records a short video answer to a profile prompt via the device camera.
/// Abstracted so tests can avoid the real camera/video platform channels.
abstract class VideoRecorderController {
  Future<RecordedVideo?> record();
}

class DeviceVideoRecorderController implements VideoRecorderController {
  final ImagePicker _picker = ImagePicker();

  @override
  Future<RecordedVideo?> record() async {
    final file = await _picker.pickVideo(
      source: ImageSource.camera,
      maxDuration: const Duration(seconds: maxPromptVideoSeconds),
    );
    if (file == null) {
      return null;
    }

    // Read the clip's real duration rather than assuming the max, so a
    // shorter recording is reported accurately to the backend.
    final probe = vp.VideoPlayerController.file(File(file.path));
    try {
      await probe.initialize();
      final seconds = probe.value.duration.inSeconds.clamp(1, maxPromptVideoSeconds);
      return RecordedVideo(path: file.path, durationSeconds: seconds);
    } finally {
      await probe.dispose();
    }
  }
}
