import 'package:image_picker/image_picker.dart';

const int maxVideoReactionSeconds = 5;

/// Records a short front-camera video reaction clip. Abstracted so tests
/// can avoid the real image_picker platform channel.
abstract class VideoReactionPickerController {
  Future<String?> recordVideoReaction();
}

class DeviceVideoReactionPickerController implements VideoReactionPickerController {
  final ImagePicker _picker = ImagePicker();

  @override
  Future<String?> recordVideoReaction() async {
    final file = await _picker.pickVideo(
      source: ImageSource.camera,
      maxDuration: const Duration(seconds: maxVideoReactionSeconds),
      preferredCameraDevice: CameraDevice.front,
    );
    return file?.path;
  }
}
