import 'package:flutter/services.dart';

/// Wraps the native screen-capture protection channel.
///
/// Android can truly block screenshots and screen recording via
/// `FLAG_SECURE`, so [setSecure] takes effect immediately there. iOS has no
/// API to block captures, so [setSecure] is a no-op on that platform; instead
/// [onScreenshotDetected] fires after the fact when the OS reports one.
class ScreenSecurityChannel {
  ScreenSecurityChannel({MethodChannel? channel})
      : _channel = channel ?? const MethodChannel('com.datingapp.mobile/screen_security') {
    _channel.setMethodCallHandler(_handleMethodCall);
  }

  final MethodChannel _channel;

  /// Called when the OS reports that a screenshot was taken while secure
  /// mode was active (iOS only - Android prevents the screenshot outright).
  void Function()? onScreenshotDetected;

  Future<void> setSecure(bool secure) async {
    try {
      await _channel.invokeMethod<bool>('setSecure', {'secure': secure});
    } on MissingPluginException {
      // No native handler registered (e.g. running under `flutter test`).
    }
  }

  Future<void> _handleMethodCall(MethodCall call) async {
    if (call.method == 'onScreenshotDetected') {
      onScreenshotDetected?.call();
    }
  }
}
