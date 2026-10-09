import type { AvatarColor } from '@shared/api';

export const AVATAR_COLORS: { value: AvatarColor; label: string; hex: string }[] = [
  { value: 'green', label: 'Зелёный', hex: '#cff4e2' },
  { value: 'blue', label: 'Синий', hex: '#dcecff' },
  { value: 'purple', label: 'Фиолетовый', hex: '#f1e2ff' },
  { value: 'rose', label: 'Розовый', hex: '#ffe1e5' },
  { value: 'yellow', label: 'Жёлтый', hex: '#fff0bd' },
  { value: 'gray', label: 'Серый', hex: '#e8e9eb' },
];

export function avatarColorHex(color: AvatarColor): string {
  return AVATAR_COLORS.find((option) => option.value === color)?.hex ?? '#e8e9eb';
}
