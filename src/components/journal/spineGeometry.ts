// Shared geometry constants for the per-row timeline spine.
//
// Lives in its own module to break what would otherwise be a require cycle
// between SpineNode (renders SpineSlice behind the dot) and SpineSlice
// (needs the column width / dot-center offset for its absolute positioning).
//
// Visual derivation:
//   NODE_COLUMN_WIDTH (64) — width of the left column in every row.
//   DOT_CENTER_Y (17)      — y-offset (from row top) of the dot's visual
//                             center: SpineNode's paddingTop (8) + half of
//                             the 18px dotWrap (9).
//   SPINE_CENTER (32)      — x-coordinate (within the column) the spine
//                             centers on. = floor(NODE_COLUMN_WIDTH / 2).

export const NODE_COLUMN_WIDTH = 64;
export const DOT_CENTER_Y = 17;
export const SPINE_CENTER = Math.round(NODE_COLUMN_WIDTH / 2);
