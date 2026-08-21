import 'package:image_picker/image_picker.dart';

/// Picks a local photo. Abstracted so tests can avoid the real image_picker
/// platform channel.
abstract class VaultPhotoPickerController {
  Future<String?> pickPhoto();
}

class DeviceVaultPhotoPickerController implements VaultPhotoPickerController {
  final ImagePicker _picker = ImagePicker();

  @override
  Future<String?> pickPhoto() async {
    final file = await _picker.pickImage(source: ImageSource.gallery);
    return file?.path;
  }
}
