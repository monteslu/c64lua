/* c64_fixed.c - 16.16 fixed-point core, PICO-8 semantics.
 * Plain-C reference (cc65 compiles it for the 6510). Ported verbatim from
 * gtlua's gt_fixed.c 16.16 branch with the GT_FIXED_ASM path removed - the C64
 * v1 runtime has no hand asm for these; that's the luacretro-6502-rt lever. */
#include "c64_fixed.h"

long c64_fmul(long a, long b) {
    /* (a*b) >> 16 via four 16x16 partial products on magnitudes. Wraps on
     * overflow like the hardware (P8 wraps too). */
    unsigned char neg = 0;
    unsigned long ua, ub, res;
    unsigned int ah, al, bh, bl;
    if (a < 0) { ua = (unsigned long)-a; neg ^= 1; } else ua = (unsigned long)a;
    if (b < 0) { ub = (unsigned long)-b; neg ^= 1; } else ub = (unsigned long)b;
    ah = (unsigned int)(ua >> 16); al = (unsigned int)(ua & 0xFFFF);
    bh = (unsigned int)(ub >> 16); bl = (unsigned int)(ub & 0xFFFF);
    res  = ((unsigned long)ah * bh) << 16;
    res += (unsigned long)ah * bl;
    res += (unsigned long)al * bh;
    res += ((unsigned long)al * bl) >> 16;
    return neg ? -(long)res : (long)res;
}

long c64_fdiv(long a, long b) {
    /* q = (a << 16) / b by restoring division over the 48-bit dividend.
     * P8: dividing by zero saturates. */
    unsigned char neg = 0;
    unsigned char i;
    unsigned long ua, ub, q, r;
    if (b == 0) return (a < 0) ? (long)0x80000001L : (long)0x7FFFFFFFL;
    if (a < 0) { ua = (unsigned long)-a; neg ^= 1; } else ua = (unsigned long)a;
    if (b < 0) { ub = (unsigned long)-b; neg ^= 1; } else ub = (unsigned long)b;
    q = 0; r = 0;
    for (i = 0; i < 48; ++i) {
        r <<= 1;
        if (i < 32) r |= (ua >> (31 - i)) & 1;
        q <<= 1;
        if (r >= ub) { r -= ub; q |= 1; }
    }
    return neg ? -(long)q : (long)q;
}

long c64_fsqrt(long x) {
    /* bit-by-bit integer sqrt of the raw bits, scaled, one Newton step. */
    unsigned long v, res, bit, t;
    if (x <= 0) return 0;
    v = (unsigned long)x;
    res = 0;
    bit = 0x40000000UL;
    while (bit > v) bit >>= 2;
    while (bit) {
        if (v >= res + bit) { v -= res + bit; res = (res >> 1) + bit; }
        else res >>= 1;
        bit >>= 2;
    }
    res <<= 8;
    if (res) {
        t = (unsigned long)c64_fdiv(x, (long)res);
        res = (res + t) >> 1;
    }
    return (long)res;
}

long c64_ffmod(long a, long b) {
    /* floored modulo: a - flr(a/b)*b, result takes the divisor's sign. */
    long q;
    if (b == 0) return 0;
    q = c64_fdiv(a, b) & (long)0xFFFF0000L;
    return a - c64_fmul(q, b);
}

int c64_ifdiv(int a, int b) {
    int q, r;
    if (b == 0) return (a < 0) ? -32767 : 32767;
    q = a / b;             /* C truncates toward zero */
    r = a - q * b;
    if (r != 0 && ((r < 0) != (b < 0))) --q;  /* correct to floor */
    return q;
}

int c64_ifmod(int a, int b) {
    int r;
    if (b == 0) return 0;
    r = a % b;
    if (r != 0 && ((r < 0) != (b < 0))) r += b;
    return r;
}

int  c64_absi(int x)  { return x < 0 ? -x : x; }
int  c64_sgni(int x)  { return x < 0 ? -1 : 1; }
int  c64_mini(int a, int b)  { return a < b ? a : b; }
int  c64_maxi(int a, int b)  { return a > b ? a : b; }
long c64_absf(long x) { return x < 0 ? -x : x; }
int  c64_sgnf(long x) { return x < 0 ? -1 : 1; }
long c64_minf(long a, long b) { return a < b ? a : b; }
long c64_maxf(long a, long b) { return a > b ? a : b; }

int c64_midi(int a, int b, int c) {
    int t;
    if (a > b) { t = a; a = b; b = t; }
    if (b > c) { b = c; }
    return a > b ? a : b;
}

long c64_midf(long a, long b, long c) {
    long t;
    if (a > b) { t = a; a = b; b = t; }
    if (b > c) { b = c; }
    return a > b ? a : b;
}
