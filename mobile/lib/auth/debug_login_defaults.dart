/// Local-dev convenience only (issue #850): the sign-in screens pre-fill
/// their fields with these values in debug builds so a developer can sign
/// in by just pressing the existing buttons, no typing required. These
/// values only work end-to-end against a backend that has explicitly opted
/// in via AUTH_DEBUG_LOGIN_ENABLED (see auth.constants.ts's
/// DEBUG_TEST_PHONE_NUMBER doc comment) - against any other backend
/// (including every production one) they behave like any other
/// phone/code and simply fail OTP verification like normal.
const String debugTestPhoneNumber = '+15555550100';
const String debugTestOtpCode = '000000';
