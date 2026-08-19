import 'package:audioplayers/audioplayers.dart';

/// Plays back a locally recorded voice intro for preview. Abstracted so
/// tests can avoid the real audio platform channel.
abstract class VoicePlayerController {
  Future<void> play(String path);
  Future<void> stop();
}

class DeviceVoicePlayerController implements VoicePlayerController {
  final AudioPlayer _player = AudioPlayer();

  @override
  Future<void> play(String path) => _player.play(DeviceFileSource(path));

  @override
  Future<void> stop() => _player.stop();
}
