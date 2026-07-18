-- plasma: the framebuffer flex. The C64 has a REAL framebuffer (VIC-II bitmap)
-- AND the c64lua runtime is DOUBLE-BUFFERED, so full-screen CPU rendering EVERY
-- frame works with no tearing - the P8 draw surface the NES cannot offer. This
-- paints sine-shaped horizontal color bands straight into the 160x200 canvas
-- and animates them by advancing a phase each frame. Each row is ONE rectfill
-- (no overdraw) so the whole screen fills in a single top-to-bottom pass.
--
-- A full-screen software redraw at ~1MHz runs BELOW 60fps - that's honest C64
-- speed (see docs/CHEATSHEET.md). The double buffer means every frame you SEE
-- is complete: it never tears, it just advances a bit slower than 60Hz.

local ramp = {6, 14, 3, 5, 7, 10, 2, 4}   -- an 8-color cycle
local t = 0

function _draw()
  cls(6)
  t += 1
  -- one shaded band per canvas row-pair: the color index sweeps with a sine so
  -- the bands ripple, and `t` scrolls the whole pattern each frame. 100
  -- rectfills of 160x2 = one full-screen pass, no overdraw.
  local y = 0
  while y < 200 do
    local phase = flr((sin(y / 60 + t / 30) + 1) * 4) + y / 12
    local c = ramp[(flr(phase) % 8) + 1]
    rectfill(0, y, 159, y + 1, c)
    y += 2
  end
  print("plasma", 60, 94, 0)
end
