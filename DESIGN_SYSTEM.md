# TRAVEL-EXPENSES-APP — Design System

**Version:** 1.0
**Style:** Colorful / Playful
**Modes:** Dark (default) + Light

---

## 1. Design Philosophy

TRAVEL-EXPENSES-APP should feel **fun, alive, and colorful** — not like a spreadsheet. Every category has its own color. Gradients add energy. Emojis add personality. The app should feel like a travel companion, not an accounting tool.

Key principles:
- **Category colors are everywhere** — icons, chips, chart bars, map pins, borders. Each category has a distinct color that creates visual consistency.
- **Gradients over flat colors** — hero cards, FAB button, AI card, budget bars, CTAs all use gradients for depth and energy.
- **Emoji-first iconography** — categories use emoji, navigation uses emoji, stats use emoji. This keeps things playful and universally understood.
- **Bold typography** — big numbers with weight 800, punchy labels, generous letter-spacing on badges. Financial data should be scannable at a glance.
- **Rounded everything** — 22px card radius, 14px buttons, bubbly and approachable. No sharp corners.
- **Both modes are first-class** — dark mode isn't just inverted light mode. Each has its own tuned palette with proper contrast and feel.

---

## 2. Color Tokens

Use these exact values. Define them in `src/constants/theme.ts` and reference them everywhere via the theme object.

### Dark Mode

```typescript
const darkTheme = {
  // Backgrounds
  bg: "#0E1016",              // Main app background
  bgSoft: "#151820",          // Subtle background variation (chart backgrounds, progress bar tracks)
  surface: "#1C2030",         // Cards, inputs, chips
  surfaceRaised: "#232840",   // Elevated cards, modals
  
  // Borders
  border: "#2E3450",          // Primary border
  borderLight: "#363D58",     // Subtle dividers inside cards
  
  // Text
  text: "#F0F1F5",            // Primary text
  textSecondary: "#9BA1BE",   // Secondary labels, descriptions
  textMuted: "#636B8A",       // Muted captions, timestamps, inactive elements
  
  // Accent (primary brand)
  accent: "#7C6EF6",          // Primary buttons, active states, links
  accentLight: "#9D92FF",     // Lighter accent for badges, subtle highlights
  accentSoft: "rgba(124, 110, 246, 0.14)",  // Accent backgrounds
  accentGlow: "rgba(124, 110, 246, 0.3)",   // Glow/shadow effects for active elements
  
  // Semantic colors — each used for a category AND for status meaning
  green: "#2ED8A4",           // Success, refunds, budget on track, Shopping category
  greenSoft: "rgba(46, 216, 164, 0.14)",
  red: "#FF6B7A",             // Error, over budget, delete
  redSoft: "rgba(255, 107, 122, 0.14)",
  orange: "#FFB347",          // Warning, excluded expenses, Food category
  orangeSoft: "rgba(255, 179, 71, 0.14)",
  blue: "#5EB5FF",            // Info, multi-day spread, Transport category
  blueSoft: "rgba(94, 181, 255, 0.14)",
  pink: "#FF7EB3",            // Flight category
  pinkSoft: "rgba(255, 126, 179, 0.14)",
  yellow: "#FFE066",          // Coffee category
  yellowSoft: "rgba(255, 224, 102, 0.14)",
  teal: "#4DD9C0",            // Other category, ongoing trips
  tealSoft: "rgba(77, 217, 192, 0.14)",
  coral: "#FF8A80",           // Activities category
  
  // Gradients
  gradient1: "linear-gradient(135deg, #7C6EF6 0%, #5EB5FF 100%)",    // Primary — hero cards, active elements, daily chart bars
  gradient2: "linear-gradient(135deg, #FF7EB3 0%, #FFB347 100%)",    // Warm — budget warning bars
  gradient3: "linear-gradient(135deg, #2ED8A4 0%, #5EB5FF 100%)",    // Cool — AI card, split balance CTA
  fabGradient: "linear-gradient(135deg, #7C6EF6 0%, #9D92FF 50%, #5EB5FF 100%)",  // FAB button
  cardGradient: "linear-gradient(135deg, #1C2030 0%, #232840 100%)", // Card backgrounds
  
  // Navigation
  navBg: "rgba(14, 16, 22, 0.92)",  // Bottom nav with blur
};
```

### Light Mode

```typescript
const lightTheme = {
  // Backgrounds
  bg: "#F5F6FA",
  bgSoft: "#EDEEF4",
  surface: "#FFFFFF",
  surfaceRaised: "#FFFFFF",
  
  // Borders
  border: "#E2E4EE",
  borderLight: "#ECEDF5",
  
  // Text
  text: "#1A1D2E",
  textSecondary: "#6B7194",
  textMuted: "#9CA0B8",
  
  // Accent
  accent: "#6C5CE7",
  accentLight: "#8577F0",
  accentSoft: "rgba(108, 92, 231, 0.1)",
  accentGlow: "rgba(108, 92, 231, 0.15)",
  
  // Semantic colors — slightly adjusted for light backgrounds
  green: "#00C48C",
  greenSoft: "rgba(0, 196, 140, 0.1)",
  red: "#FF5263",
  redSoft: "rgba(255, 82, 99, 0.1)",
  orange: "#FF9F43",
  orangeSoft: "rgba(255, 159, 67, 0.1)",
  blue: "#3B8BFF",
  blueSoft: "rgba(59, 139, 255, 0.1)",
  pink: "#FF6B9D",
  pinkSoft: "rgba(255, 107, 157, 0.1)",
  yellow: "#FFCB45",
  yellowSoft: "rgba(255, 203, 69, 0.1)",
  teal: "#00D2B4",
  tealSoft: "rgba(0, 210, 180, 0.1)",
  coral: "#FF7B72",
  
  // Gradients
  gradient1: "linear-gradient(135deg, #6C5CE7 0%, #3B8BFF 100%)",
  gradient2: "linear-gradient(135deg, #FF6B9D 0%, #FF9F43 100%)",
  gradient3: "linear-gradient(135deg, #00C48C 0%, #3B8BFF 100%)",
  fabGradient: "linear-gradient(135deg, #6C5CE7 0%, #8577F0 50%, #3B8BFF 100%)",
  cardGradient: "linear-gradient(135deg, #FFFFFF 0%, #F8F9FF 100%)",
  
  // Navigation
  navBg: "rgba(255, 255, 255, 0.92)",
};
```

---

## 3. Category Colors

Each category maps to a theme color. This mapping is consistent across the entire app — chips, icons, chart segments, map pins, borders.

```typescript
const categoryColorMap = {
  food:       "orange",    // 🍽️ Food
  transport:  "blue",      // 🚗 Transport
  hotel:      "accent",    // 🏨 Hotel
  flight:     "pink",      // ✈️ Flight
  coffee:     "yellow",    // ☕ Coffee
  shopping:   "green",     // 🛍️ Shopping
  activities: "coral",     // 🎫 Activities
  other:      "teal",      // 📦 Other
};

// Usage: getCategoryColor(category, theme) returns the color value
// Usage: getCategorySoftColor(category, theme) returns the soft/background version
```

Category icon backgrounds always use the `Soft` variant of their color. Selected/active states use the full color for borders and text, with the `Soft` variant as background.

---

## 4. Typography

Use system fonts only — no custom font loading needed.

```typescript
const fontFamily = "System"; // React Native default system font

const typography = {
  // Screen titles
  title: { fontSize: 30, fontWeight: "800", letterSpacing: -0.8 },
  
  // Section headings inside cards
  sectionTitle: { fontSize: 15, fontWeight: "700" },
  
  // Trip/item names
  itemTitle: { fontSize: 17, fontWeight: "700" },
  
  // Card sub-headings
  subtitle: { fontSize: 14, fontWeight: "600" },
  
  // Body text
  body: { fontSize: 14, fontWeight: "500" },
  
  // Secondary text, descriptions
  secondary: { fontSize: 13, fontWeight: "500" },
  
  // Captions, timestamps
  caption: { fontSize: 11, fontWeight: "500" },
  
  // Tiny labels (badges, uppercase labels)
  micro: { fontSize: 10, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  
  // Large amount display (dashboard hero)
  amountLarge: { fontSize: 40, fontWeight: "800", letterSpacing: -1.5 },
  
  // Medium amount display (stat cards, expense amounts)
  amountMedium: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  
  // Small amount display (list items)
  amountSmall: { fontSize: 16, fontWeight: "700" },
  
  // Numpad keys
  numpad: { fontSize: 22, fontWeight: "600" },
  
  // Expense entry amount
  entryAmount: { fontSize: 48, fontWeight: "800", letterSpacing: -2 },
};
```

---

## 5. Spacing & Sizing

```typescript
const spacing = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  xxl: 22,
};

const sizing = {
  // Border radius
  radiusCard: 22,         // Main cards
  radiusCardInner: 18,    // Cards inside cards (stats sections)
  radiusButton: 14,       // Buttons, numpad keys
  radiusChip: 22,         // Filter chips, badges
  radiusInput: 14,        // Text inputs
  radiusIcon: 12,         // Small icon containers
  radiusSmall: 10,        // Tags, note suggestions
  
  // Icon containers
  categoryIconLarge: 50,  // Trip list emoji container
  categoryIconMedium: 42, // Expense list emoji container
  categoryIconSmall: 36,  // Dashboard category list, dashboard recent
  categoryGridIcon: { width: "auto", height: "auto", padding: "12px 4px" },  // Add expense category grid
  
  // Map pins
  mapPin: 44,
  
  // Navigation
  navHeight: 74,
  fabSize: 56,
  fabRadius: 18,
  fabOffset: -10,         // translateY to float above nav
  
  // Header
  headerButton: 36,       // Back button, brain icon button
  headerButtonRadius: 12,
  
  // Status bar
  statusBarHeight: 50,
};
```

---

## 6. Component Patterns

### Cards
```
- Background: theme.cardGradient (subtle gradient, not flat)
- Border: 1.5px solid theme.border
- Border radius: 22px (outer cards), 18px (inner/nested cards)
- Padding: 18px
- Margin bottom: 14px between cards
- Active/selected state: border color changes to theme.accent, add boxShadow with accentGlow
```

### Hero Card (Dashboard total)
```
- Background: theme.gradient1 (purple → blue gradient)
- NO border
- Decorative circles: absolute positioned, rgba(255,255,255,0.1) and 0.06
- All text is white with varying opacity (0.7 for labels, 1.0 for amounts)
- Budget progress bar: white track at 0.2 opacity, white fill at 0.9 opacity
```

### Filter Chips
```
- Inactive: background theme.surface, border theme.border, color theme.textSecondary
- Active (All): background theme.gradient1, no border, white text
- Active (category): background getCategorySoftColor, border getCategoryColor, color getCategoryColor
- Border radius: 22px
- Padding: 7px 14px
- Font size: 12, weight: 600-700
- Category chips show emoji + name
- Scrollable horizontal row
```

### Badges
```
- Border radius: 20px
- Padding: 2px 8px
- Font: 10px, weight 700, uppercase, letterSpacing 0.4
- Refund badge: color theme.green, bg theme.greenSoft, text "REFUND"
- Excluded badge: color theme.orange, bg theme.orangeSoft, text "EXCLUDED"
- Multi-day badge: color theme.blue, bg theme.blueSoft, text "MULTI-DAY"
- Shared badge: color theme.accentLight, bg theme.accentSoft, text "👥 [name]"
- Active badge: color theme.green, bg theme.greenSoft, text "● Active"
- Ongoing badge: color theme.teal, bg theme.tealSoft, text "Ongoing"
```

### Expense List Items
```
- No card wrapper — items sit directly in the list with borderBottom dividers
- Left: category emoji in colored soft-background container (42x42, radius 13)
- Center: note (14px semibold), place + method + user below (11px muted)
- Right: amount (16px bold), converted amount below (10px muted)
- Refund amounts shown in green with "+" prefix
- Excluded items: opacity 0.45
- Badges inline with the note text
```

### Category Grid (Expense Entry)
```
- 4 columns grid
- Each cell: emoji (24px) + name (10px, weight 700)
- Padding: 12px 4px per cell
- Border radius: 14px
- Unselected: background theme.surface, border 2px theme.border
- Selected: background getCategorySoftColor, border 2px getCategoryColor, text color getCategoryColor
```

### Numpad
```
- 3 column grid, gap 6px
- Each key: height 50px, border radius 14px
- Background: theme.cardGradient (number keys), theme.surface (backspace)
- Border: 1px solid theme.border
- Font: 22px weight 600 (numbers), 20px (backspace ⌫)
- Color: theme.text
```

### Toggle Buttons (Refund, Exclude, Multi-day)
```
- Row of 3, flex: 1 each
- Border radius: 12px
- Padding: 9px 6px
- Font: 11px weight 700
- Inactive: background theme.surface, border theme.border, color theme.textMuted
- Active: background uses the semantic soft color, border uses the semantic color, text uses the semantic color
  - Refund: green
  - Exclude: orange
  - Multi-day: blue
```

### Bottom Navigation
```
- Height: 74px
- Background: theme.navBg with backdropFilter blur(20px)
- Border top: 1px solid theme.border
- 5 items evenly spaced
- Each tab: emoji (20px) + label (10px)
- Active tab: background theme.accentSoft (pill shape), emoji at full color, label in theme.accent weight 700
- Inactive tab: emoji with grayscale(0.6) opacity(0.5), label in theme.textMuted weight 500
- Center FAB: 56x56, radius 18, background theme.fabGradient, translateY(-10px), boxShadow with accentGlow
```

### Amount Display (Expense Entry)
```
- Currency badge: theme.accentLight text on theme.accentSoft background, 14px weight 700, radius 10, padding 4px 12px
- Amount: 48px weight 800, letterSpacing -2
- Normal: theme.text color
- Refund: theme.green color with "+" prefix
- Conversion note below: 12px theme.textMuted, shows home currency + location
```

### AI / Ask Card (Dashboard)
```
- Background: theme.gradient3 (green → blue)
- Border radius: 18px
- Padding: 16px
- Left: brain emoji (28px)
- Title: 14px weight 700, white
- Subtitle: 12px, rgba(255,255,255,0.7)
```

### Map Pins
```
- Circle: 44x44, border radius 50%
- Background: category color
- Border: 3px solid rgba(255,255,255,0.25)
- Box shadow: 0 4px 14px [categoryColor]55
- Emoji centered inside (20px)
- Amount label below: radius 8, padding 3px 8px, font 11px weight 700
  - Dark mode: rgba(0,0,0,0.8) background
  - Light mode: rgba(255,255,255,0.95) background
```

### Stat Pills (Dashboard quick stats)
```
- Row of 3, flex: 1 each
- Background: theme.cardGradient, border theme.border, radius 16px
- Padding: 14px 12px, text align center
- Top: emoji (20px)
- Value: 20px weight 800, theme.text
- Label: 10px weight 600, uppercase, letterSpacing 0.5, theme.textMuted
```

### Budget Progress Bar
```
- Track: height 6px, theme.bgSoft, radius 6px
- Fill: radius 6px
  - Under 70%: theme.gradient1 (purple → blue)
  - 70-90%: theme.gradient2 (pink → orange)
  - Over 90%: theme.red (solid)
- Animated width transition: 0.6s ease
```

### Split Balance Card
```
- Two user cards side by side (flex: 1, gap 10)
  - Border: 1.5px solid theme.border, radius 14
  - Name: 12px weight 600, theme.textSecondary
  - Amount: 22px weight 800, user-specific color (accent for you, pink for partner)
- Settlement CTA below: background theme.gradient3, radius 12, centered white text 14px weight 700
```

---

## 7. Animations & Transitions

Keep animations subtle but present:

```
- Card hover/press: border color transition 0.15s
- Budget bar width: transition 0.6s ease
- FAB hover: scale or translateY shift
- Screen transitions: use React Navigation's default slide animation
- Tab switching: cross-fade content
- Filter chip selection: background/border transition 0.15s
```

No heavy animations. The app should feel snappy, not sluggish. Expense entry must feel instant.

---

## 8. Theme Implementation

In React Native, implement theming with Zustand + React Context:

```typescript
// src/stores/settingsStore.ts
interface SettingsStore {
  isDark: boolean;
  toggleTheme: () => void;
}

// src/constants/theme.ts
export const darkTheme = { ... };
export const lightTheme = { ... };
export const getTheme = (isDark: boolean) => isDark ? darkTheme : lightTheme;
```

Every component receives the theme via a `useTheme()` hook. Never hardcode color values in components — always reference `theme.colorName`.

Components should use `StyleSheet.create()` for static styles and dynamic style objects for theme-dependent properties:

```typescript
// Pattern for themed components
const MyComponent = () => {
  const theme = useTheme();
  
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.title, { color: theme.text }]}>...</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    padding: 18,
    borderWidth: 1.5,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
  },
});
```

---

## 9. Dark Mode as Default

The app defaults to dark mode. The user can toggle in Settings. Persist the preference in AsyncStorage and load it on app start.

Dark mode is the default because:
- Travel often involves low-light environments (planes, evening logging)
- The colorful elements pop more on dark backgrounds
- It's easier on battery (OLED screens)
