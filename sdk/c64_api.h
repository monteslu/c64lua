/* c64_api.h - the C64 runtime surface c64lua-generated C links against.
 *
 * The picture is VIC-II multicolor bitmap mode: 160x200 native (each pixel is
 * 2:1 double-wide, displayed as 320x200). A c64lua canvas coordinate is 0-159 x
 * 0-199. Color is a C64 hardware index 0-15 (the generated code bakes P8 colors
 * to C64 indices at compile time); -1 means "current draw color". See the
 * DIFFERENCES.md notes on fat pixels + per-cell attribute clash. */
#ifndef C64_API_H
#define C64_API_H

#include "c64_fixed.h"

/* --- canvas geometry --- */
#define C64_W 160
#define C64_H 200

/* --- lifecycle --- */
void c64_init(void);           /* VIC-II bitmap mode on, clear, SID reset */
void c64_endframe(void);       /* raster-poll frame sync + housekeeping */
void c64_p8_fps30(void);       /* _update() mode: 30 fps logic+draw */
void c64_update_inputs(void);  /* latch CIA1 joystick + SPACE */
void c64_audio_init(void);     /* SID reset + master volume (sfx path) */

/* --- input: PICO-8 button indices ---
 * 0=left 1=right 2=up 3=down 4=fire(O) 5=X(SPACE) ; player 0 = joystick port 2 */
unsigned char c64_btn(int i, int pl);
unsigned char c64_btnp(int i, int pl);

/* --- drawing (PICO-8 semantics; camera offset applies to all) --- */
void c64_cls(int c);                /* 1-frame unrolled clear (asm) */
void c64_camera(int x, int y);
void c64_color(int c);
void c64_pset(int x, int y, int c);
int  c64_pget(int x, int y);
void c64_line(int x0, int y0, int x1, int y1, int c);
void c64_rect(int x0, int y0, int x1, int y1, int c);
void c64_rectfill(int x0, int y0, int x1, int y1, int c);
void c64_circ(int cx, int cy, int r, int c);
void c64_circfill(int cx, int cy, int r, int c);
void c64_spr(int n, int x, int y, int w, int h, int flip);
int  c64_print(const char *str, int x, int y, int c);
#ifdef C64_NUM8
int  c64_print_num(int v, int x, int y, int c);
#else
int  c64_print_num(long v, int x, int y, int c);
#endif
int  c64_print_int(int v, int x, int y, int c);
int  c64_print_cur_int(int v, int c);
int  c64_print_cur_num(long v, int c);
int  c64_print_cur_str(const char *s, int c);

/* --- SID sfx (compiled effect table; hardware ADSR) --- */
void c64_sfx(int n, int ch);

/* --- the asm cls engines (c64_clear.s) --- */
void c64_bitmap_clear(unsigned char byteval);   /* fill the 8000-byte bitmap */
void c64_screen_clear(unsigned char byteval);   /* fill screen RAM $C000 */
void c64_color_clear(unsigned char byteval);    /* fill color RAM $D800 */

/* --- per-cell color allocator diagnostics (dev builds) ---
 * A 4th distinct color in a 4x8 cell evicts to the nearest existing color and
 * (on C64_DEV builds) flashes the border + bumps c64_clash_count. */
extern unsigned int c64_clash_count;

/* --- bitmap + screen bases (VIC bank 3, $C000-$FFFF; bitmap under KERNAL) --- */
#define C64_BITMAP_BASE 0xE000
#define C64_SCREEN_BASE 0xC000
#define C64_COLOR_RAM   0xD800

#endif
