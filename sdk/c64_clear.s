; c64_clear.s - fast clear of the 8000-byte multicolor bitmap + IRQ control.
;
; void c64_bitmap_clear(unsigned char byteval);  cc65 passes the arg in A.
; void c64_irq_off(void);   SEI + mask CIA timer IRQs (we bank the KERNAL out,
;                           so the $FFFE IRQ vector RAM is not a valid handler).
;
; The bitmap is at $E000-$FF3F (8000 bytes) in VIC bank 3, RAM under the KERNAL
; (c64_init banks it out, so STAs hit RAM). We clear $E000-$FEFF (31 full pages
; = 7936 bytes) then $FF00-$FF3F (64 bytes) = 8000 exactly, deliberately NOT
; touching $FF40-$FFFF so the CPU vectors at $FFFA-$FFFF stay intact. Plain 6502.

.export _c64_bitmap_clear
.export _c64_screen_clear
.export _c64_color_clear
.export _c64_irq_off

.segment "CODE"

; void c64_screen_clear(unsigned char byteval);  fill the 1000 color-pair cells
; $C000-$C3E7 ONLY. The last 24 bytes ($C3E8-$C3FF) are left intact because the
; 8 sprite pointers live at $C3F8-$C3FF - clearing them would blank every MOB
; on each cls. A=byte. Pages $C000/$C100/$C200 full (768), then $C300-$C3E7 (232).
.proc _c64_screen_clear
        ldy     #0
sloop:
        sta     $C000,y
        sta     $C100,y
        sta     $C200,y
        iny
        bne     sloop
        ldy     #0
sloop2:
        sta     $C300,y
        iny
        cpy     #$E8            ; stop at $C3E8 (leave $C3E8-$C3FF alone)
        bne     sloop2
        rts
.endproc

; void c64_color_clear(unsigned char byteval);  fill color RAM $D800-$DBFF. A=byte.
.proc _c64_color_clear
        ldy     #0
cloop:
        sta     $D800,y
        sta     $D900,y
        sta     $DA00,y
        sta     $DB00,y
        iny
        bne     cloop
        rts
.endproc

.proc _c64_bitmap_clear
        ; A = fill byte; keep it in A, Y = byte index (0..255).
        ldy     #0
loop:
        sta     $E000,y
        sta     $E100,y
        sta     $E200,y
        sta     $E300,y
        sta     $E400,y
        sta     $E500,y
        sta     $E600,y
        sta     $E700,y
        sta     $E800,y
        sta     $E900,y
        sta     $EA00,y
        sta     $EB00,y
        sta     $EC00,y
        sta     $ED00,y
        sta     $EE00,y
        sta     $EF00,y
        sta     $F000,y
        sta     $F100,y
        sta     $F200,y
        sta     $F300,y
        sta     $F400,y
        sta     $F500,y
        sta     $F600,y
        sta     $F700,y
        sta     $F800,y
        sta     $F900,y
        sta     $FA00,y
        sta     $FB00,y
        sta     $FC00,y
        sta     $FD00,y
        sta     $FE00,y
        iny
        bne     loop
        ; tail: $FF00-$FF3F (64 bytes) to reach 8000, leaving vectors alone.
        ldy     #$3F
tail:
        sta     $FF00,y
        dey
        bpl     tail
        rts
.endproc

.proc _c64_irq_off
        sei
        lda     #$7F
        sta     $DC0D          ; CIA1 ICR: clear all timer-IRQ enables
        sta     $DD0D          ; CIA2 ICR
        lda     $DC0D          ; ack any pending CIA1 IRQ
        lda     $DD0D          ; ack any pending CIA2 IRQ
        lda     #$00
        sta     $D01A          ; VIC IRQ enable = none
        rts
.endproc
