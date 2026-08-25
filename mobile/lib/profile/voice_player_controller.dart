import 'package:audioplayers/audioplayers.dart';

/// Plays back a locally recorded voice intro (or an in-chat voice note) for
/// preview. Abstracted so tests can avoid the real audio platform channel.
abstract class VoicePlayerController {
  /// [speed] is a playback rate multiplier (1.0 = normal speed).
  Future<void> play(String path, {double speed = 1.0});
  Future<void> stop();
}

class DeviceVoicePlayerController implements VoicePlayerController {
  final AudioPlayer _player = AudioPlayer();

  @override
  Future<void> play(String path, {double speed = 1.0}) async {
    await _player.setPlaybackRate(speed);
    await _player.play(DeviceFileSource(path));
  }

  @override
  Future<void> stop() => _player.stop();
}
