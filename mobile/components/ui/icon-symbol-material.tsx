/**
 * Shared MaterialIcons-based icon implementation used on all platforms.
 * Kept in a separate file so icon-symbol.ios.tsx can import it without circular dependency.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

export const ICON_MAPPING = {
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left': 'chevron-left',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  'chevron.up': 'keyboard-arrow-up',
  'chevron.down': 'keyboard-arrow-down',
  'chart.line.uptrend.xyaxis': 'trending-up',
  'chart.line.downtrend.xyaxis': 'trending-down',
  'chart.line.flattrend.xyaxis': 'trending-flat',
  'arrow.triangle.2.circlepath': 'sync',
  'sun.max.fill': 'wb-sunny',
  'clock.fill': 'schedule',
  'message.fill': 'chat-bubble',
  'sparkles': 'auto-awesome',
  'moon.fill': 'nightlight-round',
  'moon.stars.fill': 'nightlight-round',
  'bed.double.fill': 'bed',
  'chart.bar.fill': 'bar-chart',
  'person.fill': 'person',
  'plus': 'add',
  'xmark': 'close',
  'arrow.right': 'arrow-forward',
  'envelope.fill': 'email',
  'lock.fill': 'lock',
  'eye.fill': 'visibility',
  'eye.slash.fill': 'visibility-off',
  'calendar': 'calendar-today',
  'info.circle.fill': 'info',
  'exclamationmark.triangle.fill': 'warning',
  'checkmark.circle.fill': 'check-circle',
  'arrow.clockwise': 'refresh',
  'square.and.arrow.up': 'share',
  'gearshape.fill': 'settings',
  'heart.fill': 'favorite',
  'star.fill': 'star',
  'line.3.horizontal': 'menu',
  // Emoji replacements (clipboard, lightbulb, stop, celebration, baby, note, pin, sleep, crystal ball)
  'list.clipboard': 'assignment',
  'lightbulb.fill': 'lightbulb',
  'stop.fill': 'stop',
  'party.popper': 'celebration',
  'figure.child': 'child-care',
  'note.text': 'edit-note',
  'pin': 'push-pin',
  'moon.zzz.fill': 'bed',
  'wand.and.stars': 'psychology',
  'people.fill': 'people',
  'pills.fill': 'medication',
  'bolt.fill': 'bolt',
  'play.fill': 'play-arrow',
  'camera.fill': 'photo-camera',
} as const;

export type IconSymbolName = keyof typeof ICON_MAPPING;
type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: string;
}) {
  const materialName = ICON_MAPPING[name] as MaterialIconName | undefined;
  if (!materialName) return null;
  return <MaterialIcons color={color} size={size} name={materialName} style={style} />;
}
