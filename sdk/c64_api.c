/* c64_api.c - the C64 multicolor-bitmap runtime for c64lua.
 *
 * VIC-II multicolor bitmap mode, VIC bank 3 ($C000-$FFFF):
 *   bitmap  $E000-$FF3F  (8000 bytes, 40x25 cells of 8 bytes; RAM under KERNAL)
 *   screen  $C000-$C3FF  (per-cell color pair: hi nibble=01, lo nibble=10)
 *   color   $D800        (per-cell 11 color, nibble RAM; fixed hardware)
 *   sprite pointers $C3F8-$C3FF
 *
 * A multicolor pixel is 2 bits and 2:1 double-wide, so the canvas is 160x200:
 *   cell_col = x>>2 (0..39), pixel-in-cell = x&3 (0..3, left->right)
 *   cell_row = y>>3 (0..24), line-in-cell = y&7
 * The two bits per pixel select: 00 shared background ($D021),
 *   01 screen-hi-nibble color, 10 screen-lo-nibble color, 11 color-RAM color.
 *
 * Per-cell color allocation (attribute clash, the authentic C64 look):
 *   drawing color k in a cell claims a free slot (01/10/11); if all three are
 *   taken by other colors, the 4th color EVICTS to the nearest existing slot
 *   (dev builds flash the border + bump c64_clash_count). See DIFFERENCES.md. */
#include "c64_api.h"
#include "c64_font.h"

/* hardware register pointers */
#define POKE(a)  (*(volatile unsigned char *)(a))
#define VIC_CTRL1   0xD011
#define VIC_CTRL2   0xD016
#define VIC_MEMORY  0xD018
#define VIC_BORDER  0xD020
#define VIC_BG0     0xD021
#define VIC_BG1     0xD022  /* multicolor uses BG0 as the 00 color */
#define CIA2_PRA    0xDD00
#define CIA2_DDRA   0xDD02
#define SID_BASE    0xD400

static unsigned char *const bitmap = (unsigned char *)C64_BITMAP_BASE;
static unsigned char *const screen = (unsigned char *)C64_SCREEN_BASE;
static unsigned char *const colram = (unsigned char *)C64_COLOR_RAM;

/* current draw color (0-15), camera offset, clash counter */
static unsigned char cur_color = 1;
int c64_cam_x = 0, c64_cam_y = 0;
unsigned int c64_clash_count = 0;
static unsigned char bg_color = 0;   /* the shared 00 background index */

/* 320 bytes per cell-row: 40 cells * 8 bytes. Precomputed row-base offsets. */
static unsigned int cellrow_off[25];

/* mask/shift tables for the 4 pixel positions in a multicolor byte.
 * pixel 0 = bits 7-6, pixel 1 = bits 5-4, pixel 2 = bits 3-2, pixel 3 = bits 1-0. */
static const unsigned char pix_clear[4] = { 0x3F, 0xCF, 0xF3, 0xFC };
static const unsigned char pix_shift[4] = { 6, 4, 2, 0 };

/* --------------------------------------------------------------------------
 * per-cell color slot allocation
 * A cell has: 00=bg_color (shared), 01=screen hi nibble, 10=screen lo nibble,
 * 11=color RAM nibble. Returns the 2-bit code (0..3) to use for color `k` in
 * the cell at (cc,cr), claiming a free slot or evicting on the 4th color.
 * -------------------------------------------------------------------------- */
static unsigned char cell_slot(unsigned char cc, unsigned char cr, unsigned char k) {
    unsigned int si = (unsigned int)cr * 40 + cc;
    unsigned char sram = screen[si];
    unsigned char c01 = sram >> 4;
    unsigned char c10 = sram & 0x0F;
    unsigned char c11 = colram[si] & 0x0F;

    if (k == bg_color) return 0;      /* shared background */
    if (c01 == k) return 1;
    if (c10 == k) return 2;
    if (c11 == k) return 3;

    /* free-slot detection: a slot equal to bg_color is considered unused
     * (nothing of that color has been drawn into it yet). Claim in 01,10,11. */
    if (c01 == bg_color) { screen[si] = (unsigned char)((k << 4) | c10); return 1; }
    if (c10 == bg_color) { screen[si] = (unsigned char)((c01 << 4) | k); return 2; }
    if (c11 == bg_color) { colram[si] = k; return 3; }

    /* attribute clash: all three slots taken by other colors. Evict to the
     * nearest existing slot color (cheap: reuse slot 3 / color RAM). */
    c64_clash_count++;
#ifdef C64_DEV
    POKE(VIC_BORDER) = 2;             /* red border flash on clash (dev only) */
#endif
    return 3;
}

/* plot one multicolor pixel (canvas coords already camera-adjusted, clipped) */
static void plot(int x, int y, unsigned char k) {
    unsigned char cc = (unsigned char)(x >> 2);
    unsigned char cr = (unsigned char)(y >> 3);
    unsigned char pin = (unsigned char)(x & 3);
    unsigned int off = cellrow_off[cr] + (unsigned int)cc * 8 + (unsigned char)(y & 7);
    unsigned char slot = cell_slot(cc, cr, k);
    unsigned char b = bitmap[off];
    b = (unsigned char)((b & pix_clear[pin]) | (slot << pix_shift[pin]));
    bitmap[off] = b;
}

/* --------------------------------------------------------------------------
 * lifecycle
 * -------------------------------------------------------------------------- */
#define CPU_PORT 0x0001
void c64_irq_off(void);   /* c64_clear.s: SEI + mask CIA/VIC IRQs */

void c64_init(void) {
    unsigned char i;
    for (i = 0; i < 25; ++i) cellrow_off[i] = (unsigned int)i * 320;

    /* We poll the raster (no IRQ). Disable CIA/VIC interrupts BEFORE banking
     * the KERNAL out, so no IRQ jumps through the now-invalid $FFFE RAM vector. */
    c64_irq_off();

    /* VIC bank 3 ($C000-$FFFF): CIA2 PRA bits 0-1 = %00 (inverted) -> bank 3. */
    POKE(CIA2_DDRA) |= 0x03;          /* bank-select bits are outputs */
    POKE(CIA2_PRA) = (POKE(CIA2_PRA) & 0xFC) | 0x00;

    /* Within bank 3: screen matrix at $C000 (offset 0 -> bits 7-4 = 0),
     * bitmap at $E000 (offset $2000 -> CB13 bit3 = 1). VIC_MEMORY = $08. */
    POKE(VIC_MEMORY) = 0x08;

    /* Bank the KERNAL out ($01 HIRAM=0) so CPU reads of the bitmap RAM at
     * $E000 hit RAM, not ROM (the VIC always reads the RAM beneath). Keep I/O
     * visible (CHAREN=1) for the $D000-$DFFF registers + raster poll. We use no
     * KERNAL after this. LORAM=1 keeps BASIC mapped harmlessly. $01 = $35:
     * %00110101 -> LORAM=1 (BASIC in), HIRAM=0 (KERNAL out), CHAREN=1 (I/O in). */
    POKE(CPU_PORT) = 0x35;

    /* enable bitmap mode (CTRL1 bit5) + multicolor (CTRL2 bit4) + display on. */
    POKE(VIC_CTRL1) = 0x3B;           /* DEN + BMM + 25-row + yscroll 3 */
    POKE(VIC_CTRL2) = 0x18;           /* MCM + 40-col + xscroll 0 */

    POKE(VIC_BORDER) = 0;             /* black border */
    POKE(VIC_BG0) = 0;                /* shared background = black */
    bg_color = 0;

    c64_cls(0);

    /* default MOB sprite data: a solid 24x21 square at $C800 (bank 3), pointer
     * value ($C800-$C000)/64 = 32. All 8 sprite pointers ($C3F8-$C3FF) point at
     * it, so spr(n,...) shows a solid block until a sheet importer supplies art.
     * Set AFTER cls (screen_clear preserves $C3E8-$C3FF, so pointers survive
     * every later cls too). */
    {
        unsigned char *sd = (unsigned char *)0xC800;
        for (i = 0; i < 63; ++i) sd[i] = 0xFF;
        for (i = 0; i < 8; ++i) POKE(0xC3F8 + i) = 32;
    }
    POKE(0xD015) = 0;                 /* all sprites disabled until spr() enables */
}

void c64_p8_fps30(void) { /* frame pacing is a raster poll; 30fps = caller loop */ }

void c64_endframe(void) {
    /* wait for the raster to pass the visible area (line 250), a reliable
     * per-frame tick (no vblank IRQ by default). */
    while (POKE(0xD012) < 250) { }
    while (POKE(0xD012) >= 250) { }
    c64_time_tick();
#ifdef C64_BENCH
    /* bench: a game-loop counter in color RAM $DBFF (last cell, off-screen). One
     * increment per completed _update/_draw/endframe cycle. Read it via
     * memory({region:'c64_color_ram', offset:0x3FF}) and divide host frames by
     * it to get frames-per-loop = the per-frame draw cost. */
    POKE(0xDBFF) = (unsigned char)(POKE(0xDBFF) + 1);
#endif
#ifdef C64_DEV
    POKE(VIC_BORDER) = 0;             /* clear the clash-flash each frame */
#endif
}

/* --------------------------------------------------------------------------
 * cls - clear the bitmap to the background color. The bitmap bytes go to 0x00
 * (every pixel = 00 = shared bg). Screen + color RAM reset so cells are free.
 * The 8000-byte fill is the asm hot path (c64_clear.s); screen/color reset is
 * a 1000-byte C loop.
 * -------------------------------------------------------------------------- */
void c64_cls(int c) {
    unsigned char k = (unsigned char)(c & 0x0F);
#ifdef C64_BENCH
    POKE(VIC_BORDER) = 1;             /* white border for the duration of cls */
#endif
    bg_color = k;
    POKE(VIC_BG0) = k;
    c64_bitmap_clear(0x00);           /* asm: all bitmap pixels -> 00 = bg */
    /* reset per-cell color slots to "empty" (all == bg so cell_slot sees them
     * free). Both fills are unrolled asm (c64_clear.s). */
    c64_screen_clear((unsigned char)((k << 4) | k));
    c64_color_clear(k);
#ifdef C64_BENCH
    POKE(VIC_BORDER) = 0;             /* black border: white band height = cls time */
#endif
}

/* --------------------------------------------------------------------------
 * primitives
 * -------------------------------------------------------------------------- */
void c64_camera(int x, int y) { c64_cam_x = x; c64_cam_y = y; }
void c64_color(int c) { cur_color = (unsigned char)(c & 0x0F); }

void c64_pset(int x, int y, int c) {
    x -= c64_cam_x; y -= c64_cam_y;
    if (x < 0 || x >= C64_W || y < 0 || y >= C64_H) return;
    if (c >= 0) cur_color = (unsigned char)(c & 0x0F);
    plot(x, y, cur_color);
}

int c64_pget(int x, int y) {
    unsigned char cc, cr, pin, slot, sram;
    unsigned int off, si;
    x -= c64_cam_x; y -= c64_cam_y;
    if (x < 0 || x >= C64_W || y < 0 || y >= C64_H) return 0;
    cc = (unsigned char)(x >> 2); cr = (unsigned char)(y >> 3); pin = (unsigned char)(x & 3);
    off = cellrow_off[cr] + (unsigned int)cc * 8 + (unsigned char)(y & 7);
    slot = (unsigned char)((bitmap[off] >> pix_shift[pin]) & 3);
    si = (unsigned int)cr * 40 + cc;
    sram = screen[si];
    if (slot == 0) return bg_color;
    if (slot == 1) return sram >> 4;
    if (slot == 2) return sram & 0x0F;
    return colram[si] & 0x0F;
}

void c64_line(int x0, int y0, int x1, int y1, int c) {
    int dx, dy, sx, sy, err, e2;
    if (c >= 0) cur_color = (unsigned char)(c & 0x0F);
    x0 -= c64_cam_x; y0 -= c64_cam_y; x1 -= c64_cam_x; y1 -= c64_cam_y;
    dx = x1 - x0; if (dx < 0) dx = -dx;
    dy = y1 - y0; if (dy < 0) dy = -dy;
    sx = x0 < x1 ? 1 : -1;
    sy = y0 < y1 ? 1 : -1;
    err = dx - dy;
    for (;;) {
        if (x0 >= 0 && x0 < C64_W && y0 >= 0 && y0 < C64_H) plot(x0, y0, cur_color);
        if (x0 == x1 && y0 == y1) break;
        e2 = err << 1;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx)  { err += dx; y0 += sy; }
    }
}

void c64_rect(int x0, int y0, int x1, int y1, int c) {
    int x, y;
    if (c >= 0) cur_color = (unsigned char)(c & 0x0F);
    if (x0 > x1) { x = x0; x0 = x1; x1 = x; }
    if (y0 > y1) { y = y0; y0 = y1; y1 = y; }
    for (x = x0; x <= x1; ++x) { c64_pset(x + c64_cam_x, y0 + c64_cam_y, -1); c64_pset(x + c64_cam_x, y1 + c64_cam_y, -1); }
    for (y = y0; y <= y1; ++y) { c64_pset(x0 + c64_cam_x, y + c64_cam_y, -1); c64_pset(x1 + c64_cam_x, y + c64_cam_y, -1); }
}

void c64_rectfill(int x0, int y0, int x1, int y1, int c) {
    int x, y, t;
    if (c >= 0) cur_color = (unsigned char)(c & 0x0F);
    x0 -= c64_cam_x; y0 -= c64_cam_y; x1 -= c64_cam_x; y1 -= c64_cam_y;
    if (x0 > x1) { t = x0; x0 = x1; x1 = t; }
    if (y0 > y1) { t = y0; y0 = y1; y1 = t; }
    if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0;
    if (x1 >= C64_W) x1 = C64_W - 1; if (y1 >= C64_H) y1 = C64_H - 1;
    /* Fast path: a span of 4 canvas pixels aligned to x&3==0 is one whole
     * bitmap BYTE (all 4 pixels share the 2-bit slot code). We allocate the
     * cell's slot ONCE and write the byte = slot*0x55, ~4x fewer stores than
     * per-pixel plot(). Ragged left/right edges fall back to plot(). */
    for (y = y0; y <= y1; ++y) {
        unsigned char cr = (unsigned char)(y >> 3);
        unsigned char yl = (unsigned char)(y & 7);
        x = x0;
        /* left ragged edge up to a 4-pixel boundary */
        while (x <= x1 && (x & 3) != 0) { plot(x, y, cur_color); x++; }
        /* whole-byte middle */
        while (x + 3 <= x1) {
            unsigned char cc = (unsigned char)(x >> 2);
            unsigned char slot = cell_slot(cc, cr, cur_color);
            unsigned int off = cellrow_off[cr] + (unsigned int)cc * 8 + yl;
            /* fill byte: every pixel = slot. slot 0->0x00,1->0x55,2->0xAA,3->0xFF */
            bitmap[off] = (unsigned char)(slot * 0x55);
            x += 4;
        }
        /* right ragged edge */
        while (x <= x1) { plot(x, y, cur_color); x++; }
    }
}

/* midpoint circle; circfill draws horizontal spans */
static void hspan(int xl, int xr, int y, unsigned char k) {
    int x;
    if (y < 0 || y >= C64_H) return;
    if (xl < 0) xl = 0; if (xr >= C64_W) xr = C64_W - 1;
    for (x = xl; x <= xr; ++x) plot(x, y, k);
}

static void cpix(int x, int y, unsigned char k) {
    if (x >= 0 && x < C64_W && y >= 0 && y < C64_H) plot(x, y, k);
}

/* circ()/circfill() draw a midpoint circle in CANVAS space (r = canvas radius).
 * Because the C64 multicolor pixel is 2:1 (double-wide), a canvas circle reads
 * ~2:1 wide on the 320x200 display - the honest fat-pixel look. c64lua keeps
 * circles in canvas coordinates (so pset/rect/circ share one coordinate system)
 * rather than pre-squashing; DIFFERENCES.md owns this choice with a picture.
 * Integer midpoint algorithm, no float lib. */
void c64_circfill(int cx, int cy, int r, int c) {
    int x, y, d;
    if (c >= 0) cur_color = (unsigned char)(c & 0x0F);
    cx -= c64_cam_x; cy -= c64_cam_y;
    if (r < 0) return;
    x = r; y = 0; d = 1 - r;
    while (x >= y) {
        hspan(cx - x, cx + x, cy + y, cur_color);
        hspan(cx - x, cx + x, cy - y, cur_color);
        hspan(cx - y, cx + y, cy + x, cur_color);
        hspan(cx - y, cx + y, cy - x, cur_color);
        y++;
        if (d < 0) d += 2 * y + 1;
        else { x--; d += 2 * (y - x) + 1; }
    }
}

void c64_circ(int cx, int cy, int r, int c) {
    int x, y, d;
    if (c >= 0) cur_color = (unsigned char)(c & 0x0F);
    cx -= c64_cam_x; cy -= c64_cam_y;
    if (r < 0) return;
    x = r; y = 0; d = 1 - r;
    while (x >= y) {
        cpix(cx + x, cy + y, cur_color); cpix(cx - x, cy + y, cur_color);
        cpix(cx + x, cy - y, cur_color); cpix(cx - x, cy - y, cur_color);
        cpix(cx + y, cy + x, cur_color); cpix(cx - y, cy + x, cur_color);
        cpix(cx + y, cy - x, cur_color); cpix(cx - y, cy - x, cur_color);
        y++;
        if (d < 0) d += 2 * y + 1;
        else { x--; d += 2 * (y - x) + 1; }
    }
}

/* --------------------------------------------------------------------------
 * print - the 3x5 font (c64_font.h), 4px advance. Multicolor pixels are
 * double-wide, so a 3-wide glyph reads clearly.
 * -------------------------------------------------------------------------- */
static int cursor_x = 0, cursor_y = 0;

static int glyph_index(unsigned char ch) {
    if (ch >= '0' && ch <= '9') return ch - '0';
    if (ch >= 'A' && ch <= 'Z') return 10 + (ch - 'A');
    if (ch >= 'a' && ch <= 'z') return 10 + (ch - 'a');
    switch (ch) {
        case ' ': return 36;
        case '!': return 37;
        case '-': return 38;
        case ':': return 39;
        case '.': return 40;
        case '/': return 41;
        default:  return 36;   /* unknown -> space */
    }
}

static void draw_glyph(int gx, int gy, unsigned char ch, unsigned char k) {
    int row, col;
    int gi = glyph_index(ch);
    for (row = 0; row < 5; ++row) {
        unsigned char bits = c64_font[gi][row];
        for (col = 0; col < 3; ++col) {
            if (bits & (4 >> col)) cpix(gx + col, gy + row, k);
        }
    }
}

int c64_print(const char *str, int x, int y, int c) {
    unsigned char k = (c >= 0) ? (unsigned char)(c & 0x0F) : cur_color;
    int gx = x - c64_cam_x;
    int gy = y - c64_cam_y;
    const char *p = str;
    while (*p) {
        draw_glyph(gx, gy, (unsigned char)*p, k);
        gx += 4;
        ++p;
    }
    cursor_x = gx + c64_cam_x;
    cursor_y = y;
    return cursor_x;
}

/* itoa helpers for print(number) */
static int print_long(long v, int x, int y, unsigned char k) {
    char buf[12];
    int i = 0, gx, j;
    unsigned long u;
    unsigned char neg = 0;
    if (v < 0) { neg = 1; u = (unsigned long)(-v); } else u = (unsigned long)v;
    if (u == 0) buf[i++] = '0';
    while (u) { buf[i++] = (char)('0' + (u % 10)); u /= 10; }
    if (neg) buf[i++] = '-';
    gx = x - c64_cam_x;
    for (j = i - 1; j >= 0; --j) { draw_glyph(gx, y - c64_cam_y, (unsigned char)buf[j], k); gx += 4; }
    cursor_x = gx + c64_cam_x; cursor_y = y;
    return cursor_x;
}

#ifdef C64_NUM8
int c64_print_num(int v, int x, int y, int c) {
    return print_long((long)v, x, y, (c >= 0) ? (unsigned char)(c & 15) : cur_color);
}
#else
int c64_print_num(long v, int x, int y, int c) {
    /* v is 16.16 fixed - print the integer part */
    return print_long(v >> 16, x, y, (c >= 0) ? (unsigned char)(c & 15) : cur_color);
}
#endif
int c64_print_int(int v, int x, int y, int c) {
    return print_long((long)v, x, y, (c >= 0) ? (unsigned char)(c & 15) : cur_color);
}
int c64_print_cur_int(int v, int c) { return c64_print_int(v, cursor_x, cursor_y, c); }
int c64_print_cur_num(long v, int c) { return c64_print_num(v, cursor_x, cursor_y, c); }
int c64_print_cur_str(const char *s, int c) { return c64_print(s, cursor_x, cursor_y, c); }

/* --------------------------------------------------------------------------
 * input - joystick port 2 = player 1 (host port 0). btn(5) = SPACE.
 * c64_update_inputs latches the CIA1 state each frame; btn/btnp read the latch.
 * -------------------------------------------------------------------------- */
#define CIA1_PRA 0xDC00
#define CIA1_PRB 0xDC01
#define CIA1_DDRA 0xDC02

/* pressed-bit layout (our internal): 0=left 1=right 2=up 3=down 4=fire 5=space */
static unsigned char pad_cur = 0, pad_prev = 0;

void c64_update_inputs(void) {
    unsigned char raw, p = 0;
    pad_prev = pad_cur;
    POKE(CIA1_DDRA) = 0xFF;            /* port A all output (joystick read) */
    raw = (unsigned char)~POKE(CIA1_PRA);   /* active-low -> 1 = pressed */
    /* CIA1 joystick bits: 0=up 1=down 2=left 3=right 4=fire */
    if (raw & 0x04) p |= 0x01;        /* left  -> btn 0 */
    if (raw & 0x08) p |= 0x02;        /* right -> btn 1 */
    if (raw & 0x01) p |= 0x04;        /* up    -> btn 2 */
    if (raw & 0x02) p |= 0x08;        /* down  -> btn 3 */
    if (raw & 0x10) p |= 0x10;        /* fire  -> btn 4 */
    pad_cur = p;
}

unsigned char c64_btn(int i, int pl) {
    (void)pl;
    if (i < 0 || i > 5) return 0;
    return (pad_cur & (1 << i)) ? 1 : 0;
}

unsigned char c64_btnp(int i, int pl) {
    (void)pl;
    if (i < 0 || i > 5) return 0;
    return ((pad_cur & ~pad_prev) & (1 << i)) ? 1 : 0;
}

/* --------------------------------------------------------------------------
 * hardware sprites (MOB layer) - entities 0-7 ride MOBs. A minimal v1: spr()
 * positions + enables sprite n at (x,y) using the shared sprite data slot; a
 * real sheet importer fills the sprite data. Entities 8+ software-blit is a
 * documented v2 lever (DIFFERENCES.md); v1 clamps n to 0-7.
 * -------------------------------------------------------------------------- */
#define VIC_SPR_ENA 0xD015
#define VIC_SPR_X(n) (0xD000 + (n) * 2)
#define VIC_SPR_Y(n) (0xD001 + (n) * 2)
#define VIC_SPR_X8  0xD010
#define VIC_SPR_COL(n) (0xD027 + (n))

void c64_spr(int n, int x, int y, int w, int h, int flip) {
    unsigned char m;
    (void)w; (void)h; (void)flip;
    if (n < 0 || n > 7) return;
    x -= c64_cam_x; y -= c64_cam_y;
    /* MOB coords: X offset +24, Y offset +50 from the visible top-left.
     * Canvas x is 160-wide (2:1), so double it into the 320-px sprite space. */
    {
        int sx = (x << 1) + 24;
        int sy = y + 50;
        POKE(VIC_SPR_X(n)) = (unsigned char)(sx & 0xFF);
        if (sx & 0x100) POKE(VIC_SPR_X8) |= (1 << n); else POKE(VIC_SPR_X8) &= (unsigned char)~(1 << n);
        POKE(VIC_SPR_Y(n)) = (unsigned char)(sy & 0xFF);
    }
    POKE(VIC_SPR_COL(n)) = cur_color;
    m = POKE(VIC_SPR_ENA);
    POKE(VIC_SPR_ENA) = (unsigned char)(m | (1 << n));
}

/* --------------------------------------------------------------------------
 * SID sfx - a tiny compiled-effect table. Each sfx is freq + waveform + ADSR.
 * v1 ships a handful of built-in effects on voice 3; hardware envelopes do the
 * work. audioDebug({chip:'sid'}) is the verify loop.
 * -------------------------------------------------------------------------- */
#define SID_V3 (SID_BASE + 14)   /* voice 3 base (2*7) */
#define SID_VOL 0xD418

typedef struct { unsigned int freq; unsigned char wave; unsigned char ad; unsigned char sr; } sfx_t;
static const sfx_t sfx_tab[8] = {
    { 0x1000, 0x11, 0x09, 0x00 },   /* 0 blip (triangle)  */
    { 0x2000, 0x21, 0x0A, 0x00 },   /* 1 zap  (sawtooth)  */
    { 0x0800, 0x41, 0x0C, 0xF0 },   /* 2 tone (pulse)     */
    { 0x3000, 0x81, 0x05, 0x00 },   /* 3 noise burst      */
    { 0x1800, 0x11, 0x1A, 0xA5 },   /* 4 chime            */
    { 0x0C00, 0x21, 0x08, 0x50 },   /* 5 bloop            */
    { 0x2800, 0x41, 0x06, 0x30 },   /* 6 beep             */
    { 0x0600, 0x81, 0x0F, 0xC8 },   /* 7 rumble           */
};

void c64_audio_init(void) {
    unsigned char i;
    for (i = 0; i < 25; ++i) POKE(SID_BASE + i) = 0;
    POKE(SID_VOL) = 0x0F;             /* master volume max */
}

void c64_sfx(int n, int ch) {
    const sfx_t *s;
    (void)ch;
    if (n < 0 || n > 7) return;
    s = &sfx_tab[n];
    POKE(SID_V3 + 0) = (unsigned char)(s->freq & 0xFF);
    POKE(SID_V3 + 1) = (unsigned char)(s->freq >> 8);
    POKE(SID_V3 + 2) = 0x00;          /* pulse width lo */
    POKE(SID_V3 + 3) = 0x08;          /* pulse width hi (~50%) */
    POKE(SID_V3 + 5) = s->ad;         /* attack/decay */
    POKE(SID_V3 + 6) = s->sr;         /* sustain/release */
    POKE(SID_V3 + 4) = (unsigned char)(s->wave | 0x01);   /* gate on */
}
