export const PROFILE_DISPLAY_NAME_KEY = 'profile_display_name';
export const MAX_DISPLAY_NAME_LENGTH = 80;

export function validateDisplayName(value: string): string {
  const name = value.trim();
  if (!name) throw new Error('Enter a display name.');
  if (Array.from(name).length > MAX_DISPLAY_NAME_LENGTH) throw new Error('Use 80 characters or fewer.');
  if (/[\u0000-\u001f\u007f]/.test(name)) throw new Error('Use a name without line breaks or control characters.');
  return name;
}

export function profileInitials(name: string, email = ''): string {
  const source = name.trim() || email.split('@')[0] || '';
  const words = source.split(/\s+/).filter(Boolean);
  if (!words.length) return 'WC';
  const initials = words.length > 1
    ? [Array.from(words[0])[0], Array.from(words.at(-1)!)[0]].join('')
    : Array.from(words[0]).slice(0, 2).join('');
  return initials.toLocaleUpperCase();
}
