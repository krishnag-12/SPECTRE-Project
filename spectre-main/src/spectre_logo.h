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
    // Using size 1 (6x8) for the label, positioned to align vertically
    // with the icon center
    disp.setTextColor(SSD1306_WHITE);
    disp.setTextSize(1);
    disp.setCursor(48, 28); // Right of icon, vertically centered
    disp.print("S.P.E.C.T.R.E.");

    // Thin horizontal rule below the text for visual polish
    disp.drawLine(48, 39, 124, 39, SSD1306_WHITE);

    // Subtitle: small system status below the rule
    disp.setTextSize(1);
    disp.setCursor(52, 43);
    disp.print("TACTICAL  MESH");

    disp.display();
}

// ---------------------------------------------------------------------------
// Boot variant: logo + "SYSTEM ONLINE" subtitle. Shown once during setup().
// ---------------------------------------------------------------------------
static void drawSpectreBootScreen(Adafruit_SSD1306& disp) {
    disp.clearDisplay();

    // Draw the geometric M icon
    drawSpectreIcon(disp, 4, 10);

    // Large title
    disp.setTextColor(SSD1306_WHITE);
    disp.setTextSize(1);
    disp.setCursor(48, 18);
    disp.print("S.P.E.C.T.R.E.");

    // Horizontal rule
    disp.drawLine(48, 29, 124, 29, SSD1306_WHITE);

    // Boot status text
    disp.setCursor(48, 34);
    disp.print("SYSTEM  ONLINE");

    // Version / build info
    disp.setCursor(48, 46);
    disp.print("v2.0  [SECURED]");

    disp.display();
}

#endif // SPECTRE_LOGO_H
