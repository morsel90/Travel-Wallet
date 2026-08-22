/**
 * تنقية بيانات Sentry من الحقول الحساسة — نسخة خادمية من src/utils/errorScrubbing.ts.
 *
 * لا وحدة مشتركة بين functions/ (CommonJS) وsrc/ (ESM/TS) — نفس نمط
 * isValidNameKeyJs/deriveShortNameJs في index.js. القائمة يجب أن تبقى
 * مطابقة للنسخة العميلة عند تعديل أي منهما.
 */

const SENSITIVE_KEYS = new Set([
  'iban', 'bankName', 'beneficiary', 'bankDetails',
  'email', 'displayName', 'changedByEmail',
  'description', 'name', 'shortName',
]);

const REDACTED = '[محذوف]';

function deepScrub(value) {
  if (Array.isArray(value)) return value.map(deepScrub);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, SENSITIVE_KEYS.has(key) ? REDACTED : deepScrub(v)])
    );
  }
  return value;
}

function scrubServerEvent(event) {
  delete event.user;
  delete event.request;
  if (event.extra) event.extra = deepScrub(event.extra);
  return event;
}

module.exports = { scrubServerEvent };
