-- plasma: the framebuffer flex. The C64 has a REAL framebuffer (VIC-II bitmap),
-- so full-screen CPU rendering works with no queue and no vblank wall - the P8
-- draw surface the NES cannot offer. This paints sine-shaped horizontal color
-- bands straight into the 160x200 canvas. Each row is ONE rectfill (no overdraw)
-- so the whole screen fills in a single top-to-bottom pass. Drawn once - a live
-- per-frame plasma is possible but ~1MHz-slow (see docs/CHEATSHEET.md perf).

local ramp = {6, 14, 3, 5, 7, 10, 2, 4}   -- an 8-color cycle

function _init()
  cls(6)
  -- one shaded band per canvas row-pair: the color index sweeps with a sine so
  -- the bands ripple. 100 rectfills of 160x2 = one full-screen pass, no overdraw.
  local y = 0
  while y < 200 do
    local phase = flr((sin(y / 60) + 1) * 4) + y / 12
    local c = ramp[(flr(phase) % 8) + 1]
    rectfill(0, y, 159, y + 1, c)
    y += 2
  end
  print("plasma", 60, 94, 0)
end

function _draw() end
