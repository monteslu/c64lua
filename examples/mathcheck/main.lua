-- mathcheck: fixed-point conformance. Draws a column of known math results;
-- the values are the same 16.16 PICO-8-semantics goldens the whole luacretro
-- family shares (flr, division, modulo, sqrt, sin). A visual self-test:
-- read the numbers against the comments to confirm the math core is correct.

-- Drawn every frame in _draw() (the runtime is double-buffered, so a full
-- cls+redraw each frame is correct and tear-free - the normal game-engine model).
function _draw()
  cls(0)
  print("mathcheck", 50, 8, 7)

  -- integer + fixed division / modulo (floor semantics, not C truncation)
  print(flr(7 / 2),        20, 30, 1)    -- 3
  print(flr(-9 / 2),       20, 42, 1)    -- -5
  print(7 % 3,             20, 54, 1)    -- 1
  print(flr(sqrt(49)),     20, 66, 1)    -- 7

  -- sin/cos anchors (P8 turns, screen-space-inverted sin)
  print(flr(sin(0) * 100),     20, 84, 3)    -- 0
  print(flr(sin(0.25) * 100),  20, 96, 3)    -- -100
  print(flr(cos(0) * 100),     20, 108, 3)   -- 100

  -- fixed multiply
  print(flr(1.5 * 4),      20, 126, 10)  -- 6
end
