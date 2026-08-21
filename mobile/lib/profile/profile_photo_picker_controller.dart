import 'package:image_picker/image_picker.dart';

/// Picks a local photo. Abstracted so tests can avoid the real image_picker
/// platform channel.
abstract class ProfilePhotoPickerController {
  Future<String?> pickPhoto();
}

class DeviceProfilePhotoPickerController implements ProfilePhotoPickerController {
  final ImagePicker _picker = ImagePicker();

  @override
  Future<String?> pickPhoto() async {
    final file = await _picker.pickImage(source: ImageSource.gallery);
    return file?.path;
  }
}
