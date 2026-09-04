export const OTP_MAX_VERIFY_ATTEMPTS = 5;
export const DEFAULT_OTP_TTL_SECONDS = 300;
export const DEFAULT_OTP_RESEND_COOLDOWN_SECONDS = 60;
export const DEFAULT_OTP_CODE_LENGTH = 6;

// Local-dev convenience only (issue #848/#850): when AUTH_DEBUG_LOGIN_ENABLED
// is explicitly set (never in production - see .env.example, it's absent
// there on purpose), requesting an OTP for this one fixed phone number
// always issues DEBUG_OTP_CODE instead of a random code, so the mobile
// app's debug-mode pre-filled sign-in screen (see phone_entry_screen.dart /
// otp_verify_screen.dart) can always log in with no typing. Every other
// phone number, and this one when the flag is off, still gets a real random
// OTP through the normal flow.
export const DEBUG_TEST_PHONE_NUMBER = '+15555550100';
export const DEBUG_OTP_CODE = '000000';
