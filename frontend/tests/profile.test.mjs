import test from 'node:test';
import assert from 'node:assert/strict';
import { profileInitials, validateDisplayName } from '../utils/profile.ts';

test('display names support international names and preserve user-entered spelling', () => {
  assert.equal(validateDisplayName('  Suresh Raj  '), 'Suresh Raj');
  assert.equal(validateDisplayName('李 小龙'), '李 小龙');
  assert.equal(validateDisplayName("María O’Connor"), "María O’Connor");
  assert.equal(validateDisplayName('🌱'.repeat(80)).length, 160);
});

test('display names reject empty, overlong and control-character input before saving', () => {
  assert.throws(() => validateDisplayName('   '), /Enter a display name/);
  assert.throws(() => validateDisplayName('a'.repeat(81)), /80 characters/);
  assert.throws(() => validateDisplayName('Jordan\nDoe'), /control characters/);
});

test('avatar initials follow the saved display name and have clear identity fallbacks', () => {
  assert.equal(profileInitials('Suresh Raj'), 'SR');
  assert.equal(profileInitials('Jordan Alex Doe'), 'JD');
  assert.equal(profileInitials('李 小龙'), '李小');
  assert.equal(profileInitials('Suresh'), 'SU');
  assert.equal(profileInitials('', 'suresh@example.test'), 'SU');
  assert.equal(profileInitials(''), 'WC');
});
