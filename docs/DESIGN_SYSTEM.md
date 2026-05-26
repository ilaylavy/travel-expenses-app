# TRAVEL-EXPENSES-APP — Design System

**Version:** 2.0 (Refined edition)
**Style:** Indigo-monochrome, refined and editorial
**Modes:** Dark (default) + Light
**Source of truth:** `.claude/skills/travel-expenses-design/` — the CSS tokens
in `colors_and_type.css` and the JSX primitives in `ui-kit/` are mirrored
into `src/constants/theme.ts` and `src/components/`.

---

## 1. Design Philosophy

The app reads as a calm, focused travel companion — financial data deserves
breathing room, not visual noise. Color is reserved for category meaning
and brand identity; everything else is flat surface + hairline border. The
result feels editorial and tight, not playful or busy.

Key principles:
- **Indigo monochrome leads** — one accent (refined indigo). Category
  tints stay desaturated and only surface in chips, icons, and chart
  segments. No multi-stop rainbow gradients.
- **Flat surfaces by default** — cards, sheets, inputs, buttons all sit on
  1px hairline borders. Gradients are reserved for four surfaces only:
  the hero stats strip, the FAB, the Ask card icon tile, and the splash.
- **SVG icons everywhere** — the icon registry in `src/components/Icon.tsx`
  is the single source. Default categories resolve to registry icons via
  `CategoryIcon`; emoji is allowed only for user-created custom categories.
- **Monogram trip avatars** — trip identity is a two-letter initial in a
  tinted tile. No emoji avatars in app chrome.
- **Tabular numerals on every amount** — `fontVariant: ['tabular-nums']`
  is baked into every amount-* typography token so digits never wobble.
- **Brand radii are non-negotiable** — 22px outer, 18px inner, 14px form,
  22px chip. The numpad uses 14px for consistency with the surrounding
  form surface.
- **Both modes are first-class** — dark is the default, but light is a
  full, tuned palette (not an inverted dark). Every screen must work in
  both modes; every color comes from `useTheme()`.

---

## 2. Color Tokens

Use these exact values. Define them in `src/constants/theme.ts` and reference them everywhere via the theme object.

### Dark Mode (refined)

```typescript
const darkTheme = {
  // Backgrounds — deeper, cooler base; the surfaces step up subtly
  bg: "#0B0D13",
  bgSoft: "#14171F",
  surface: "#191D27",
  surfaceRaised: "#1E2330",

  // Borders — read as silhouettes, not lines
  border: "#262B3A",
  borderLight: "#1F2330",

  // Text
  text: "#F0F1F5",
  textSecondary: "#9BA1BE",
  textMuted: "#5F6580",

  // Accent — refined indigo
  accent: "#7C6EF6",
  accentLight: "#9D92FF",
  accentSoft: "rgba(124, 110, 246, 0.12)",
  accentGlow: "rgba(124, 110, 246, 0.22)",

  // Semantic / category tints — lower saturation to sit beside the
  // monochrome surface without shouting
  green: "#34C28B",  greenSoft: "rgba(52, 194, 139, 0.12)",
  red: "#E25C6A",    redSoft: "rgba(226, 92, 106, 0.12)",
  orange: "#E89F4D", orangeSoft: "rgba(232, 159, 77, 0.12)",
  blue: "#57A8E8",   blueSoft: "rgba(87, 168, 232, 0.12)",
  pink: "#DC78A6",   pinkSoft: "rgba(220, 120, 166, 0.12)",
  yellow: "#D9C462", yellowSoft: "rgba(217, 196, 98, 0.12)",
  teal: "#4DC5B0",   tealSoft: "rgba(77, 197, 176, 0.12)",
  coral: "#E47974",  coralSoft: "rgba(228, 121, 116, 0.12)",

  // Gradients — two-stop, indigo monochrome only. Reserved for hero
  // strip, FAB, Ask card icon tile, splash. Nothing else.
  gradient1: ["#4F45C7", "#6E5FE0"],
  fabGradient: ["#5F52DC", "#7C6EF6"],
  // Retained but rarely used; non-indigo combos are off-brand now.
  gradient2: ["#B25A78", "#C97A55"],
  gradient3: ["#2E9E76", "#4994C2"],
  cardGradient: ["#1B1F2B", "#181C26"],

  navBg: "rgba(11, 13, 19, 0.92)",
};
```

### Light Mode (refined)

```typescript
const lightTheme = {
  bg: "#FAFAFC",
  bgSoft: "#F2F3F8",
  surface: "#FFFFFF",
  surfaceRaised: "#FFFFFF",
  border: "#E5E7EE",
  borderLight: "#EFF0F5",

  text: "#15172A",
  textSecondary: "#5A607D",
  textMuted: "#A3A8BC",

  accent: "#6151E0",
  accentLight: "#7E70EE",
  accentSoft: "rgba(97, 81, 224, 0.08)",
  accentGlow: "rgba(97, 81, 224, 0.12)",

  green: "#19A56C",  greenSoft: "rgba(25, 165, 108, 0.08)",
  red: "#D24654",    redSoft: "rgba(210, 70, 84, 0.08)",
  orange: "#D78838", orangeSoft: "rgba(215, 136, 56, 0.08)",
  blue: "#2F89D4",   blueSoft: "rgba(47, 137, 212, 0.08)",
  pink: "#C45D8C",   pinkSoft: "rgba(196, 93, 140, 0.08)",
  yellow: "#C2A12F", yellowSoft: "rgba(194, 161, 47, 0.08)",
  teal: "#16AA94",   tealSoft: "rgba(22, 170, 148, 0.08)",
  coral: "#C95F5A",  coralSoft: "rgba(201, 95, 90, 0.08)",

  gradient1: ["#6151E0", "#8275ED"],
  fabGradient: ["#6151E0", "#8275ED"],
  gradient2: ["#C45D8C", "#D78838"],
  gradient3: ["#19A56C", "#2F89D4"],
  cardGradient: ["#FFFFFF", "#FBFBFD"],

  navBg: "rgba(255, 255, 255, 0.92)",
};
```

**Gradient policy.** Only `gradient1` and `fabGradient` should appear in
new screens. Use them on the hero stats strip, the FAB, the splash tile,
and the Ask CTA icon tile. Everything else stays flat. `cardGradient` and
the warm/cool gradients are kept for legacy compatibility — do not use
them on new surfaces.

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

The refined edition runs deliberately airier — base-4 with custom 22/28/36
steps reserved for screen padding and the breathing room around hero
cards.

```typescript
const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 28,
  xxxl: 36,
  base: 16, // canonical screen padding
};

const sizing = {
  // Brand radii — the four numbers that define the silhouette
  radiusCard: 22,         // Outer cards, trip list cards, top of bottom sheets
  radiusCardInner: 18,    // Nested cards, AI Ask CTA card, monogram tiles
  radiusButton: 14,       // Buttons, numpad keys, inputs
  radiusChip: 22,         // Filter chips, status pills
  radiusInput: 14,
  radiusIcon: 12,         // Small icon containers (38–44 px tiles)
  radiusSmall: 10,        // Tags, note suggestions, balance card icon tile
  radiusPill: 999,        // Dots, settled chips, circular controls

  // Icon containers
  categoryIconLarge: 50,  // Trip card monogram tile
  categoryIconMedium: 42, // Expense list icon
  categoryIconSmall: 36,  // Dashboard small icons, header buttons

  // Map pins
  mapPin: 44,             // Container; actual circle is 42x42, true round

  // Navigation
  navHeight: 74,
  fabSize: 56,
  fabRadius: 18,
  fabOffset: -10,

  // Header buttons
  headerButton: 36,
  headerButtonRadius: 12,

  statusBarHeight: 50,
};

const borderWidth = {
  hairline: 1,            // The default — used everywhere flat
  base: 1.5,              // Reserved (currently only the heroBadge in signup)
  heavy: 2,               // Reserved for extreme emphasis (map pin border)
};
```

---

## 6. Component Patterns

### Cards (default flat)
```
- Background: theme.surface (flat — no gradient)
- Border: 1px hairline solid theme.border
- Border radius: 22px (outer cards), 18px (inner/nested cards)
- Padding: 18–22px (md/lg via the Card primitive)
- Active state: border color flips to theme.accent, optional accent glow
- The legacy theme.cardGradient is kept only for the rare nested raised
  surface — prefer flat surface with a subtle border for everything new.
```

### Hero Stats Strip (Dashboard total)
```
- Background: theme.gradient1 (indigo monochrome, two stops)
- NO border
- Two decorative discs (180×180 top-right, smaller bottom-left) at
  rgba(255,255,255,0.06–0.10) for subtle depth
- All text is white; labels at 0.7 opacity, amounts at 1.0
- Budget bar: white track at 0.2 opacity, white fill at 0.9
- Tabular-nums on every digit
```

### Trip Avatars (Monograms)
```
- Two-letter initial from trip.name (utils/initials.ts)
- Tinted tile via Avatar primitive: hexAlpha(tint, 0.14) bg + 1px tint border
- Tint is deterministic per trip.id via utils/tripTint.ts → 8-color palette
- Default size: 50px tile, 18px radius (matches radiusCardInner)
- Header variants: 32px tile, 10px radius
- Emoji is never used for trip identity in the refined edition.
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
- Default ~74px tall (system inset adds to this)
- Background: theme.navBg
- Top border: 1px hairline, theme.border
- Top corners rounded to 18px (radiusCardInner) for the floating-card feel
- 4 tab items evenly spaced — no embedded FAB
- Each tab: SVG icon (20px) + label (11px, weight 700, letterSpacing 0.2)
- Active tab: SVG icon in theme.accent inside a 30px accent-soft pill, label in theme.accent
- Inactive tab: SVG icon + label in theme.textMuted
- FAB is rendered separately by screens that want it (the Expenses tab),
  not part of the nav itself. 62×62 footprint, radius 20, fabGradient,
  glow shadow. Mirrors to bottom-left in RTL.
- Glass-blur backdrop is on the roadmap (requires expo-blur native dep).
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
- Background: theme.accentSoft, 1px theme.accent border, radius 18
- Padding: 16px
- Left: 38×38 solid theme.accent tile with SVG `sparkles` icon (white, 20px)
- Title: 14px weight 700, theme.text — "Ask anything about this trip"
- Subtitle: 12px weight 500, theme.textSecondary — sample questions
- Trailing: SVG chevron-right (mirrors in RTL)
- Implemented in `src/components/trip/AskAnythingCard.tsx`.
```

### Balance Card (Dashboard, shared trips only)
```
- Background: theme.surface, 1px theme.border, radius 14
- Padding: 12 × 14
- Left: 36×36 icon tile — accent-soft + `currency-swap` (open) or green-soft + `check` (settled)
- Body: "Balance" + signed net amount (tabular-nums) inline; subtitle names the top obligation
- Trailing: SVG chevron-right
- Hidden on solo trips (memberCount === 1). Implemented in
  `src/components/trip/BalanceCard.tsx`.
```

### Map Pins
```
- Circle: 42x42, border-radius 21 (true circle)
- Background: category color from the SVG icon registry
- Border: 2px solid rgba(255,255,255,0.15)
- Box shadow: 0 4px 12px [categoryColor] @ 0.35 opacity
- SVG category icon centered (20px, white, stroke 2)
- Amount label below: radius 6, padding 3×8, font 10px weight 600, tabular-nums
- Cluster pin: same circle geometry, accent fill, count label inside
```

### Stat Pills (Dashboard quick stats)
```
- Row of 3, flex: 1 each
- Background: theme.surface (flat — no gradient), 1px theme.border, radius 16
- Padding: 14 × 10, items centered
- SVG icon (20px) → value (20px weight 800, tabular-nums) → label (10px micro)
```

### Budget Progress Bar
```
- Track: height 6, theme.bgSoft, pill radius
- Fill: pill radius
  - Under 90%: theme.fabGradient (indigo monochrome two-stop)
  - 90%+ : theme.red (solid)
- The pink→orange and green→blue legacy gradients are NOT used here.
```

### Split Balance Card (Stats screen)
```
- Single bg-soft card, radius 16, padding 16
- Top: net-balance amount (28px weight 800, signed, color = green/red/secondary)
- Tagline below explains direction (will receive / will send / nets to even)
- "Open" pill (accent fill, white text) plus chevron-right
- Obligation rows below the divider: 24px monogram tile + name + signed amount
- Implemented in `src/components/stats/SplitBalanceCard.tsx`.
```

### Loading & Feedback Primitives

**Skeleton** (`src/components/ui/Skeleton.tsx`)
```
- Base bg-soft block with a shimmer band that sweeps horizontally
- Animated via Animated.translateX with the native driver
- Used by TripCardSkeleton; can be composed for any placeholder shape
```

**TypingBubble + TypingDots** (`src/components/ui/`)
```
- Three dots with a 0.16s staggered pulse + small "thinking…" label
- Wrapped in the AI chat bubble shape (surface + hairline border)
- Used in the Ask screen while waiting on the model
```

**ErrorBanner** (`src/components/ui/ErrorBanner.tsx`)
```
- Tinted background with matching foreground text + leading icon
- Tones: error (red soft / red fg) and warning (orange soft / orange fg)
- Wrap in a Pressable if it should dismiss; otherwise static
```

**Toast** (`src/stores/toastStore.ts` + `src/components/ui/ToastContainer.tsx`)
```
- Global queue. Call `pushToast(message, tone)` from anywhere
- Mounted once in app/_layout via <ToastContainer />
- Tones: success (green), error (red), info (accent)
- Auto-dismisses after 3.2s; tapping dismisses earlier
```

**SplashScreen** (`src/components/ui/SplashScreen.tsx`)
```
- Indigo gradient tile (64×64, radius 18) holding the `flight` icon
- Wordmark "Travel·Expenses" with accent middle-dot
- Tagline below (i18n: splash.tagline)
- Soft accent pulse beneath; replaces the ActivityIndicator during boot
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
