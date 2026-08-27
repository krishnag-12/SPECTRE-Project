// =============================================================================
// S.P.E.C.T.R.E. OLED Logo — 128x64 SSD1306
// Geometric "M" icon rendered via drawLine + "S.P.E.C.T.R.E." text
// =============================================================================
#ifndef SPECTRE_LOGO_H
#define SPECTRE_LOGO_H

#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ---------------------------------------------------------------------------
// The geometric "M" icon from the project logo.
// Designed for a ~36x32 pixel bounding box.
// Rendered as vector line-art for maximum crispness on monochrome OLED.
//
// Visual reference (approximate):
//
//       /\      /\
//      /  \    /  \
//     /    \  /    \
//    /      \/      \
//   /   /\      /\   \
//  /   /  \    /  \   \
// /   /    \  /    \   \
//    /      \/      \
//
// ---------------------------------------------------------------------------

static void drawSpectreIcon(Adafruit_SSD1306& disp, int ox, int oy) {
    // Outer M: two peaks, 36px wide, 30px tall
    // Left stroke: bottom-left → top-left peak
    disp.drawLine(ox,      oy + 29, ox + 9,  oy,      SSD1306_WHITE);
    disp.drawLine(ox + 1,  oy + 29, ox + 10, oy,      SSD1306_WHITE); // thicken
    // Left peak → center valley
    disp.drawLine(ox + 9,  oy,      ox + 18, oy + 16, SSD1306_WHITE);
    disp.drawLine(ox + 10, oy,      ox + 19, oy + 16, SSD1306_WHITE); // thicken
    // Center valley → right peak
    disp.drawLine(ox + 18, oy + 16, ox + 27, oy,      SSD1306_WHITE);
    disp.drawLine(ox + 19, oy + 16, ox + 28, oy,      SSD1306_WHITE); // thicken
    // Right peak → bottom-right
    disp.drawLine(ox + 27, oy,      ox + 36, oy + 29, SSD1306_WHITE);
    disp.drawLine(ox + 28, oy,      ox + 37, oy + 29, SSD1306_WHITE); // thicken

    // Inner chevron (the nested V inside the M, offset downward)
    // Gives the overlapping geometric depth effect from the logo
    disp.drawLine(ox + 7,  oy + 17, ox + 18, oy + 29, SSD1306_WHITE);
    disp.drawLine(ox + 8,  oy + 17, ox + 19, oy + 29, SSD1306_WHITE); // thicken
    disp.drawLine(ox + 18, oy + 29, ox + 29, oy + 17, SSD1306_WHITE);
    disp.drawLine(ox + 19, oy + 29, ox + 30, oy + 17, SSD1306_WHITE); // thicken
}

// ---------------------------------------------------------------------------
// Draw the full S.P.E.C.T.R.E. logo: geometric M icon + text.
// Fills the entire 128x64 display.
// ---------------------------------------------------------------------------
static void drawSpectreLogo(Adafruit_SSD1306& disp) {
    disp.clearDisplay();

    // Draw the geometric M icon centered-left, vertically centered
    // Icon bounding box: 38x30, placed at (4, 17) for vertical centering
    drawSpectreIcon(disp, 4, 17);

    // Draw "S.P.E.C.T.R.E." text to the right of the icon
    // At text size 1, each char is 6px wide. Available width from x=44
    // to x=128 is 84px = exactly 14 characters.
    disp.setTextColor(SSD1306_WHITE);
    disp.setTextSize(1);
    disp.setCursor(44, 28); // Right of icon, vertically centered
    disp.print("S.P.E.C.T.R.E."); // 14 chars = 84px → 44+84 = 128 ✓

    // Thin horizontal rule below the text for visual polish
    disp.drawLine(44, 39, 127, 39, SSD1306_WHITE);

    // Subtitle: small system status below the rule
    disp.setTextSize(1);
    disp.setCursor(44, 43);
    disp.print("TACTICAL MESH");  // 13 chars = 78px → fits ✓

    disp.display();
}

// ---------------------------------------------------------------------------
// Boot variant: logo + "SYSTEM ONLINE" subtitle. Shown once during setup().
// ---------------------------------------------------------------------------
static void drawSpectreBootScreen(Adafruit_SSD1306& disp) {
    disp.clearDisplay();

    // Draw the geometric M icon
    drawSpectreIcon(disp, 4, 10);

    // Large title — 14 chars max (6px each = 84px, x=44 to x=128)
    disp.setTextColor(SSD1306_WHITE);
    disp.setTextSize(1);
    disp.setCursor(44, 18);
    disp.print("S.P.E.C.T.R.E."); // 14 chars → 44+84 = 128 ✓

    // Horizontal rule
    disp.drawLine(44, 29, 127, 29, SSD1306_WHITE);

    // Boot status text
    disp.setCursor(44, 34);
    disp.print("SYSTEM ONLINE");   // 13 chars → fits ✓

    // Version / build info
    disp.setCursor(44, 46);
    disp.print("v2.0 [SECURED]");  // 14 chars → 44+84 = 128 ✓

    disp.display();
}

#endif // SPECTRE_LOGO_H
