/* c64_fixed.h - 16.16 fixed-point runtime with PICO-8 semantics.
 * Numbers are signed 32-bit (C long): 16 integer bits, 16 fraction bits.
 * Overflow wraps; division by zero saturates to +/-0x7FFF.FFFF (P8 manual).
 *
 * Ported from gtlua's gt_fixed core (same 6502/cc65 toolchain). The C64 build
 * uses the plain-C reference implementations (cc65 compiles them for the 6510);
 * the designated hot-path asm replacements are a v2 lever, tracked in the
 * shared luacretro-6502-rt extraction (see docs/DIFFERENCES.md). */
#ifndef C64_FIXED_H
#define C64_FIXED_H

long c64_fmul(long a, long b);
long c64_fdiv(long a, long b);

long c64_fsqrt(long x);
long c64_ffmod(long a, long b);      /* floored modulo, sign of divisor */
int  c64_ifdiv(int a, int b);        /* flr(a/b) for ints */
int  c64_ifmod(int a, int b);        /* floored modulo for ints */

int  c64_absi(int x);
long c64_absf(long x);
int  c64_sgni(int x);                /* sgn(0) == 1, per PICO-8 */
int  c64_sgnf(long x);
int  c64_mini(int a, int b);
int  c64_maxi(int a, int b);
int  c64_midi(int a, int b, int c);
long c64_minf(long a, long b);
long c64_maxf(long a, long b);
long c64_midf(long a, long b, long c);

long c64_fsin(long turns);
long c64_fcos(long turns);
long c64_fatan2(long dx, long dy);
long c64_rnd(long x);
int  c64_rnd_int(int n);          /* integer-range rnd, no fixed multiply */
void c64_srand(long seed);
long c64_time(void);

void c64_time_tick(void);

#endif
