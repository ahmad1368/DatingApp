import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

/// Records the device microphone to a local file. Abstracted so tests can
/// avoid the real microphone/platform channel.
abstract class VoiceRecorderController {
  Future<bool> hasPermission();
  Future<void> start();
  Future<String?> stop();
}

class DeviceVoiceRecorderController implements VoiceRecorderController {
  final AudioRecorder _recorder = AudioRecorder();

  @override
  Future<bool> hasPermission() => _recorder.hasPermission();

  @override
  Future<void> start() async {
    final directory = await getTemporaryDirectory();
    final path = '${directory.path}/voice_intro_${DateTime.now().millisecondsSinceEpoch}.m4a';
    await _recorder.start(const RecordConfig(), path: path);
  }

  @override
  Future<String?> stop() => _recorder.stop();
}
