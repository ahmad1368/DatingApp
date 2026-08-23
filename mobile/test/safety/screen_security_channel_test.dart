import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/safety/screen_security_channel.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const methodChannel = MethodChannel('com.datingapp.mobile/screen_security');
  final messenger = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

  tearDown(() {
    messenger.setMockMethodCallHandler(methodChannel, null);
  });

  test('setSecure invokes the native channel with the requested value', () async {
    MethodCall? received;
    messenger.setMockMethodCallHandler(methodChannel, (call) async {
      received = call;
      return true;
    });
    final channel = ScreenSecurityChannel(channel: methodChannel);

    await channel.setSecure(true);

    expect(received?.method, 'setSecure');
    expect(received?.arguments, {'secure': true});
  });

  test('ignores a missing native implementation', () async {
    messenger.setMockMethodCallHandler(methodChannel, null);
    final channel = ScreenSecurityChannel(channel: methodChannel);

    await expectLater(channel.setSecure(false), completes);
  });

  test('invokes onScreenshotDetected when the native side reports one', () async {
    final channel = ScreenSecurityChannel(channel: methodChannel);
    var detected = false;
    channel.onScreenshotDetected = () => detected = true;

    final data = methodChannel.codec.encodeMethodCall(const MethodCall('onScreenshotDetected'));
    await messenger.handlePlatformMessage(methodChannel.name, data, (_) {});

    expect(detected, isTrue);
  });
}
