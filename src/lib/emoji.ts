// The one shared emoji palette, used everywhere a person taps to pick a glyph — a
// routine card (CardDeckEditor), a carnet (a house / car / thing), and any future
// picker. Deliberately BROAD ("show 'em all"): a routine wants toothbrushes and
// breakfast, a carnet wants houses, cars and DIY/upkeep tools — so one generous,
// curated set serves both rather than each place hand-rolling a narrow list.
//
// Grouped by theme in source for maintenance; rendered as one flat scrollable grid
// (EmojiPicker). Add to whichever group fits — order here is the order shown.
export const EMOJI_SET = [
  // Day parts · routines · self-care (the original routine-card set)
  '🌅', '☀️', '🌙', '⭐', '😴', '🙂', '🪥', '🛁', '🚿', '🧼', '🧴', '🚽', '🧻',
  // Home · rooms · furniture · appliances
  '🏠', '🏡', '🏢', '🏘️', '🛏️', '🛋️', '🚪', '🪟', '🪑', '🚰', '🔌', '💡', '🔋',
  '🧹', '🧽', '🧺', '🧼', '🗑️', '🧯', '🌡️', '🪣', '📦', '🔑', '🗝️',
  // Cars · vehicles · transport (carnets: l'auto)
  '🚗', '🚙', '🛻', '🚐', '🏎️', '🚕', '🚲', '🏍️', '🛵', '🛴', '⛽', '🅿️', '🛞', '🚧',
  // Tools · DIY · maintenance (carnets: entretien)
  '🔧', '🔨', '🪛', '🪚', '🧰', '⚙️', '🔩', '🪜', '🧲', '🪝', '🔦', '🧱', '🪵', '🩹',
  // Clothing · laundry
  '👕', '👚', '🧦', '👟', '🧥', '👗', '🧢', '🧤', '🧣',
  // Food · drink · cooking
  '🍽️', '🥞', '🍳', '🥛', '☕', '🍞', '🧀', '🥗', '🍕', '🍝', '🍎', '🍌', '🥕', '🥦',
  '🍓', '🍇', '🥔', '🧅', '🍅', '🥚', '🍰', '🍪', '🍫',
  // Play · sport · hobbies · music · art
  '🧸', '🎨', '📚', '📖', '✏️', '⚽', '🏀', '🏒', '🎾', '🚴', '🏊', '🎣', '🎮', '🧩',
  '🎵', '🎸', '🎹', '🥁', '🎤', '🎬', '🃏', '🎲',
  // Nature · animals · plants · weather
  '🌱', '🌳', '🌲', '🌸', '🌼', '🍁', '🐟', '🐶', '🐱', '🐰', '🐦', '🐢', '🐝', '🦋',
  '❄️', '🔥', '💧', '⚡', '🌧️', '🌈', '⛄',
  // Health · care · time
  '❤️', '🩺', '💊', '🦷', '🧬', '🌡️', '⏰', '📅', '🔔', '📌', '📎', '✅', '⚠️',
  // People · family · celebration
  '👶', '🧒', '👦', '👧', '🧑', '👩', '👨', '👵', '👴', '🎂', '🎈', '🎁', '🎉', '💌',
  // Money · shopping · work
  '💰', '💵', '🛒', '🏷️', '🧾', '💼', '🏦', '📈', '🖥️', '📱', '📷', '🔒',
]
