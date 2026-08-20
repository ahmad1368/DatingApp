import 'package:image_picker/image_picker.dart';

const int maxVideoSnippetSeconds = 2;

/// Picks a short local video clip. Abstracted so tests can avoid the real
/// image_picker platform channel.
abstract class VideoPickerController {
  Future<String?> pickVideo();
}

class DeviceVideoPickerController implements VideoPickerController {
  final ImagePicker _picker = ImagePicker();

  @override
  Future<String?> pickVideo() async {
    final file = await _picker.pickVideo(
      source: ImageSource.gallery,
      maxDuration: const Duration(seconds: maxVideoSnippetSeconds),
    );
    return file?.path;
  }
}
