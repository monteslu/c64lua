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

-- _draw() runs every frame. This scene is static, so we draw it once behind a
-- guard: re-drawing a full 160x200 bitmap every frame is too slow at ~1 MHz and
-- would tear (you'd see it mid-redraw). Draw once, let it hold.
local drawn = 0

function _draw()
  if (drawn == 1) then return end
  drawn = 1
  cls(0)                       -- black background
  -- NOTE: colors are passed as RAW C64 indices here (7=yellow, 6=blue, 0=black),
  -- NOT PICO-8 indices. The P8->C64 bake only fires on a color LITERAL handed
  -- straight to a draw verb; routing a color through disc()'s `col` parameter
  -- (a runtime variable) skips the bake, so use the C64 index directly. See
  -- docs/ASSETS.md for the full P8<->C64 color table.
  disc(80, 96, 22, 7)          -- yellow head (C64 index 7), round on screen
  -- eyes: small, high on the face, close to center
  disc(74, 89, 3, 0)           -- left eye (C64 black)
  disc(86, 89, 3, 0)           -- right eye (C64 black)
  -- smile: a bold U-curve. y grows DOWNWARD, so to make the mouth's middle sit
  -- LOW and its ends curl UP (a smile, not a frown), the middle needs the
  -- LARGEST y: y = base + (k - i*i)/k pushes the center down and lifts the ends.
  local i = -9
  while i <= 9 do
    local y = 104 - flr((i * i) / 11)   -- ends higher (small y), middle lower
    pset(80 + i, y, 0)
    pset(80 + i, y + 1, 0)              -- second row = a bolder line
    i += 1
  end
  print("hello c64", 58, 134, 7)   -- white
end
