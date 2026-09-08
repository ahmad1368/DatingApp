/// Default base URL used by every backend API client.
///
/// `10.0.2.2` is the special alias the Android emulator maps to the host
/// machine's `localhost`, which only resolves inside an Android emulator.
/// Override it at build/run time with `--dart-define=API_BASE_URL=...` to
/// target a physical device, a backend on the LAN, Flutter web, or staging.
const String defaultApiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:3000',
);
