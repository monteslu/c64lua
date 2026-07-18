-- hello: a centered smiley + centered text (the c64lua "it works" cart).
-- Canvas is 160x200 (VIC-II multicolor bitmap). Center is (80,100).
--
-- The scene is drawn ONCE in _init: the C64 is ~1MHz with no blitter, so a
-- full-screen redraw every frame is expensive (see docs/CHEATSHEET.md perf
-- model). A static picture like this is drawn once and simply displayed.
--
-- ROUND ON SCREEN: the multicolor pixel is 2:1 (double-wide), so a plain
-- circfill reads as an oval. `disc` below draws a midpoint circle (integer
-- only, no float lib) but HALVES each horizontal span's x-extent, so a disc of
-- radius r is r tall and ~r wide on the 320x200 display: round to the eye. The
-- raw circfill still draws canvas-space circles for anyone who wants them
-- (see docs/DIFFERENCES.md).

-- round-on-screen filled disc. Same midpoint algorithm as circfill, but every
-- horizontal span is drawn at half width (x>>1) to cancel the 2:1 fat pixel.
function disc(cx, cy, r, col)
  local x = r
  local y = 0
  local d = 1 - r
  while x >= y do
    rectfill(cx - (x >> 1), cy + y, cx + (x >> 1), cy + y, col)
    rectfill(cx - (x >> 1), cy - y, cx + (x >> 1), cy - y, col)
    rectfill(cx - (y >> 1), cy + x, cx + (y >> 1), cy + x, col)
    rectfill(cx - (y >> 1), cy - x, cx + (y >> 1), cy - x, col)
    y += 1
    if d < 0 then
      d += 2 * y + 1
    else
      x -= 1
      d += 2 * (y - x) + 1
    end
  end
end

function _init()
  cls(0)                       -- black background
  -- NOTE: colors are passed as RAW C64 indices here (7=yellow, 6=blue, 2=red),
  -- NOT PICO-8 indices. The P8->C64 bake only fires on a color LITERAL handed
  -- straight to a draw verb; routing a color through disc()'s `col` parameter
  -- (a runtime variable) skips the bake, so use the C64 index directly. See
  -- docs/ASSETS.md for the full P8<->C64 color table.
  disc(80, 96, 22, 7)          -- yellow head (C64 index 7), round on screen
  disc(72, 92, 5, 6)           -- left eye (C64 blue)
  disc(88, 92, 5, 6)           -- right eye (C64 blue)
  -- smile: a shallow upward arc of pixels
  local i = -8
  while i <= 8 do
    pset(80 + i, 106 - flr((i * i) / 12), 6)
    i += 1
  end
  print("hello c64", 58, 132, 7)   -- white
end

function _draw()
  -- static scene; nothing to redraw each frame.
end
