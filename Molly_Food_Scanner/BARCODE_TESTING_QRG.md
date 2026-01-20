# Barcode Scanner Testing - Quick Reference

## Setup

```bash
cd /home/anombyte/Atlas/Molly_Food_Scanner
npm run dev
```

Open: `http://localhost:3002/molly-food-scanner.html`

## Quick Tests (5 minutes)

### 1. Camera Test ✅
- [ ] Click "Scan Barcode"
- [ ] Allow camera permission
- [ ] See camera preview
- [ ] Click "Cancel Scan"
- [ ] Verify camera stops

### 2. Known Barcode Test ✅
Test with these barcodes (Open Food Facts):
- **Coca-Cola**: `5449000000996`
- **Nutella**: `8000500033268`
- **Kinder**: `8000500013128`

**How to test without physical product**:
1. Search "[product name] barcode image"
2. Display barcode on screen
3. Scan with phone or second device

**Expected**:
- Product name displays
- Nutri-Score shown (A-E)
- Additives listed
- Rating 0-100

### 3. Error Handling ✅
- [ ] Deny camera → See error message
- [ ] Scan unknown barcode → AI fallback triggers

## Visual Checklist

### Scanner UI ✅
- [ ] Black overlay background
- [ ] Camera preview (3:4 aspect ratio)
- [ ] White guide frame (center)
- [ ] Blue corner brackets
- [ ] Animated scanning line (moves up/down)
- [ ] Status text: "Scanning..."
- [ ] "Cancel Scan" button (red)

### Product Display ✅
- [ ] Product name
- [ ] Barcode number
- [ ] Rating circle (0-100)
- [ ] Color coding (green/yellow/red)
- [ ] Summary text
- [ ] Chemicals list
- [ ] View/Hide toggle

## Test Barcodes

### Open Food Facts (Known Products)
```
5449000000996  - Coca-Cola
8000500033268  - Nutella
8000500013128  - Kinder Chocolate
7622210449286  - Oreo
5000159400246  - Heinz Ketchup
```

### Unknown (AI Fallback Test)
```
9999999999999  - Should trigger AI fallback
```

## Mobile Testing

### On Phone
1. Open same URL on mobile device
2. Connect to same network
3. Test camera access
4. Verify touch targets

### DevTools Emulation
1. Chrome DevTools → Toggle device toolbar
2. Select iPhone 12 or similar
3. Test scanner responsiveness

## Performance Benchmarks

| Metric | Target | Actual |
|--------|--------|--------|
| Scanner open | < 2s | ___ |
| Camera init | < 1s | ___ |
| Barcode detect | < 3s | ___ |
| OFF lookup | < 2s | ___ |
| AI fallback | < 10s | ___ |

## Common Issues

### Camera Not Opening
- Check browser permissions
- Try different browser (Chrome/Edge)
- Ensure HTTPS (or localhost)

### Barcode Not Detecting
- Improve lighting
- Hold camera steady
- Align barcode in guide frame
- Ensure barcode is in focus

### Open Food Facts Not Found
- Expected for US/local products
- AI fallback should activate
- Check internet connection

## Success Criteria

All tests pass if:
- ✅ Camera opens and closes cleanly
- ✅ Barcode detection works within 3 seconds
- ✅ Open Food Facts products display correctly
- ✅ Unknown products trigger AI fallback
- ✅ Error messages are clear and helpful
- ✅ Mobile UI is responsive and usable
- ✅ No camera data is transmitted (verify in DevTools Network tab)

## Test Report

**Date**: ___________
**Tester**: ___________
**Browser**: ___________
**Device**: ___________

| Test | Pass | Fail | Notes |
|------|------|------|-------|
| Camera access | ☐ | ☐ | |
| Known barcode | ☐ | ☐ | |
| Unknown barcode | ☐ | ☐ | |
| Cancel scan | ☐ | ☐ | |
| Permission denied | ☐ | ☐ | |
| Mobile UI | ☐ | ☐ | |
| Performance | ☐ | ☐ | |

**Overall Status**: ___________

**Issues Found**:
-
-
-

**Suggestions**:
-
-
-
