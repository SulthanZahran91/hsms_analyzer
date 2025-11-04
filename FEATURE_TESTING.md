# Feature Testing Guide

This document describes how to test the newly implemented features:
1. Brush Selection for Time Range
2. SxFy Highlight Patterns
3. Text Search in Payloads

## Prerequisites

1. Backend running:
```bash
cd backend
cargo run --release
# Server starts on http://localhost:8080
```

2. Frontend running (in separate terminal):
```bash
cd frontend
bun install
bun run dev
# App starts on http://localhost:5173
```

## Feature 1: Brush Selection for Time Range

### How it Works
- **Shift + Click** two messages on the plot to select a time range
- The selected range becomes a filter that shows only messages within that timespan
- Visual indicators show the selection in progress

### Test Steps

1. Upload a log file (e.g., `fixtures/event_flood.ndjson`)
2. Wait for the timeline plot to render
3. **Shift + Click** on any message arrow in the plot
   - You should see a blue dashed horizontal line appear at that point
   - A tooltip should appear saying "Shift+Click second point to select time range"
4. **Shift + Click** on another message (earlier or later)
   - The time range filter should activate
   - The FilterBar should show a blue "Time Range Filter" section at the top
   - Only messages within the selected range should be visible
5. Click **Clear Range** button to remove the filter
   - All messages should reappear

### Edge Cases to Test
- Clicking messages in reverse order (later message first) - should still work
- Pressing **Escape** during selection - should cancel
- Normal click (without Shift) - should just select the row, not start brush selection

## Feature 2: SxFy Highlight Patterns

### How it Works
- Enter Stream/Function pairs in the "Highlight S/F Patterns" input
- Matching messages get a golden glow and thicker border
- Highlights are visual only - they don't filter messages

### Test Steps

1. Upload `fixtures/event_flood.ndjson` or `fixtures/mixed.ndjson`
2. In the FilterBar, find the **Highlight S/F Patterns** input
3. Enter a pattern like `6,11` (for S6F11 messages)
   - Messages matching S6F11 should get a golden background glow
   - Below the input, you should see "Highlighting: S6F11"
4. Try multiple patterns: `6,11;1,3` or `6,11 1,4`
   - All matching messages should be highlighted
5. Clear the input to remove highlights

### Supported Formats
- Semicolon-separated: `1,3;6,11`
- Space-separated: `1,3 6,11`
- Single pattern: `6,11`

### Edge Cases to Test
- Invalid input (non-numbers) - should be ignored
- CEID highlighting also works (existing feature, already implemented)
- Highlighted messages respect current filters (won't show if filtered out)

## Feature 3: Text Search in Payloads

### How it Works
- Type text in the "Text Search" input
- Backend searches through all message payloads (body_json)
- Only messages with matching payload content are shown
- Search is case-insensitive
- 500ms debounce prevents searching on every keystroke

### Test Steps

1. Upload `fixtures/event_flood.ndjson`
2. In the FilterBar, find the **Text Search** input
3. Type a search term that exists in payloads:
   - Try: `LotStart` (should match CEID 201 events)
   - Try: `ProcessStart` (should match CEID 202 events)
   - Try: `EventReport` (should match all S6F11 events)
4. Wait 500ms - you should see "⏳ Searching..." in the meta bar
5. Results should update to show only matching messages
6. Clear the search to see all messages again

### How to Find Valid Search Terms

Look at the fixture files to see payload content:
```bash
cat fixtures/event_flood.ndjson | head -1 | jq '.body_json'
```

Example payload structure:
```json
{
  "secs_tree": {"t":"L","items":[{"t":"U4","v":201}]},
  "semantic": {
    "kind":"EventReport",
    "ceid":201,
    "ceid_name":"LotStart"
  }
}
```

Valid search terms from this payload:
- `LotStart`
- `EventReport`
- `U4` (from secs_tree)
- `201` (matches both CEID and value)

### Edge Cases to Test
- Empty search - should show all messages
- Search term not found - should show empty results
- Very short search terms (1-2 chars) - still works but may be slow
- Search combines with other filters (time range, dir, S/F)

## Combined Testing

Test all features working together:

1. Upload `fixtures/mixed.ndjson`
2. **Brush select** a time range with Shift+Click
3. **Highlight** S6F11 messages with `6,11`
4. **Search** for a specific term in payloads
5. All three should work together:
   - Only messages in time range shown (filter)
   - Matching S6F11 messages glow (highlight)
   - Only messages with search term shown (filter)

## Implementation Details

### Backend
- Text search implemented in `backend/service/src/routes.rs::apply_filter()`
- Lines 309-331 handle payload loading and text matching
- Case-insensitive search using `.to_lowercase()`

### Frontend
- **Brush Selection**: `PlotCanvas.tsx` - Shift+Click handler, visual indicators
- **SxFy Highlights**: `PlotCanvas.tsx` - Shadow/glow rendering, `FilterBar.tsx` - input parsing
- **Text Search**: `App.tsx` - Backend search trigger, `FilterBar.tsx` - debounced input

### Visual Indicators
- **Time Range**: Blue highlighted section in FilterBar with Clear button
- **SxFy Highlights**: Golden glow (rgba(255,215,0,0.8)) around matching arrows
- **Text Search**: "⏳ Searching..." in meta bar during backend search

## Troubleshooting

### Backend Issues
```bash
# Check if backend is running
curl http://localhost:8080/health

# Check logs for errors
cd backend && cargo run
```

### Frontend Issues
```bash
# Check browser console for errors
# Verify VITE_API_BASE points to backend
echo $VITE_API_BASE  # Should be http://localhost:8080

# Rebuild if needed
cd frontend
bun run build
```

### Text Search Not Working
- Verify backend route `/sessions/{id}/search` returns results
- Check network tab in browser DevTools
- Ensure payload files exist in `./data/{session_id}/payloads/`

### Highlights Not Showing
- Verify canvas is rendering (check browser console)
- Try simpler patterns first: `6,11` instead of complex multi-pattern
- Ensure messages matching the pattern exist in the data

## Performance Notes

- Text search may be slow on large datasets (>50k messages) since it loads every payload
- Consider adding indexes or caching for production use
- Brush selection works entirely client-side - very fast
- Highlights are rendered every frame - tested up to 15k visible messages


