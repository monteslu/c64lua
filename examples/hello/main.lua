-- hello: a centered smiley + centered text (the c64lua "it works" cart).
-- Canvas is 160x200 (VIC-II multicolor bitmap). Center is (80,100).
--
-- The scene is drawn ONCE in _init: the C64 is ~1MHz with no blitter, so a
-- full-screen redraw every frame is expensive (see docs/CHEATSHEET.md perf
-- model). A static picture like this is drawn once and simply displayed.

function _init()
  cls(0)                       -- black background
  -- smiley face, centered. Radii are canvas units (2:1 fat pixels), so the head
  -- reads a touch wide on screen - the honest C64 look (see DIFFERENCES.md).
  circfill(80, 96, 20, 10)     -- yellow head (P8 10 -> C64 yellow)
  circfill(72, 90, 3, 6)       -- left eye (blue)
  circfill(88, 90, 3, 6)       -- right eye (blue)
  -- smile: a shallow upward parabola of pixels
  local i = -8
  while i <= 8 do
    pset(80 + i, 108 - flr((i * i) / 10), 6)
    i += 1
  end
  print("hello c64", 58, 140, 7)   -- white
end

function _draw()
  -- static scene; nothing to redraw each frame.
end
