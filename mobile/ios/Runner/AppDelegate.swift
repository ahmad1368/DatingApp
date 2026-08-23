import Flutter
import UIKit

private let screenSecurityChannelName = "com.datingapp.mobile/screen_security"

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private var screenSecurityChannel: FlutterMethodChannel?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    let result = super.application(application, didFinishLaunchingWithOptions: launchOptions)

    if let controller = window?.rootViewController as? FlutterViewController {
      let channel = FlutterMethodChannel(
        name: screenSecurityChannelName,
        binaryMessenger: controller.binaryMessenger
      )
      // iOS does not let apps block screenshots or screen recording at the OS
      // level, so this just acknowledges the request without enabling anything.
      // Screenshots are only detectable after the fact, via the notification
      // observer registered below.
      channel.setMethodCallHandler { _, result in
        result(false)
      }
      screenSecurityChannel = channel
    }

    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleScreenshotTaken),
      name: UIApplication.userDidTakeScreenshotNotification,
      object: nil
    )

    return result
  }

  @objc private func handleScreenshotTaken() {
    screenSecurityChannel?.invokeMethod("onScreenshotDetected", arguments: nil)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
  }
}
