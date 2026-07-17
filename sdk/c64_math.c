/* c64_math.c - PICO-8 math library on 16.16 fixed point:
 * turns-based trig (256-step ROM table, screen-space-inverted sin),
 * 16-bit xorshift rnd/srand, and t()/time() as an exact 1/60s accumulator.
 * Ported from gtlua's gt_math.c (16.16 branch). The rng is plain C here
 * (gtlua's was a ~40-cycle asm helper; a v2 lever for the C64 too). */
#include "c64_fixed.h"
#include "c64_sintab.h"

long c64_fsin(long turns) {
    /* index = top 8 bits of the turn fraction */
    return c64_sintab[(unsigned char)(((unsigned long)turns >> 8) & 0xFF)];
}

long c64_fcos(long turns) {
    /* cos(x) = -p8sin(x + 0.25) */
    return -c64_sintab[(unsigned char)((((unsigned long)turns + 0x4000UL) >> 8) & 0xFF)];
}

long c64_fatan2(long dx, long dy) {
    /* PICO-8 convention: angle in turns [0,1). First-octant arctan via the
     * classic approximation, quadrant-folded. */
    unsigned char swap = 0, mirror = 0, negate = 0;
    long mx = dx, my = -dy;          /* screen space -> math space */
    long ax, ay, r, a;
    if (dx == 0 && dy == 0) return 0xC000L;
    if (mx < 0) { mirror = 1; ax = -mx; } else ax = mx;
    if (my < 0) { negate = 1; ay = -my; } else ay = my;
    if (ay > ax) { swap = 1; r = c64_fdiv(ax, ay); }
    else         {           r = c64_fdiv(ay, ax); }
    a = c64_fmul(r, 0x2000L + c64_fmul(0x0B20L, 0x10000L - r));
    if (swap) a = 0x4000L - a;
    if (mirror) a = 0x8000L - a;
    if (negate) a = -a;
    return a & 0xFFFFL;
}

/* ---- rnd / srand: 16-bit xorshift ----
 * Full 65535-value orbit, never yields 0. */
static unsigned int c64_rng_state = 0x2C9E;

static unsigned int c64_rng_next(void) {
    unsigned int x = c64_rng_state;
    x ^= x << 7;
    x ^= x >> 9;
    x ^= x << 8;
    c64_rng_state = x;
    return x;
}

int c64_rnd_int(int n) {
    unsigned int s = c64_rng_next();
    if (n <= 0) return 0;
    /* (s*n) >> 16 == flr(rnd(n)) by construction */
    return (int)c64_fmul((long)s, (long)n);
}

long c64_rnd(long x) {
    unsigned int s = c64_rng_next();
    if (x <= 0) return 0;
    /* fraction in [0,1) from 16 random bits, scaled: rnd(x) = frac * x */
    return c64_fmul((long)s, x);
}

void c64_srand(long seed) {
    c64_rng_state = (unsigned int)(seed >> 16) ^ (unsigned int)seed;
    if (c64_rng_state == 0) c64_rng_state = 0xABCDU;
}

/* ---- t()/time(): seconds since boot (16.16), advanced by c64_endframe ---- */
long c64_time_acc = 0;
static unsigned char c64_time_rem = 0;

void c64_time_tick(void) {
    /* 1/60 s in 16.16 = 1092 + 16/60 exactly */
    c64_time_acc += 1092L;
    c64_time_rem += 16;
    if (c64_time_rem >= 60) { c64_time_rem -= 60; c64_time_acc += 1; }
}

long c64_time(void) { return c64_time_acc; }
