-- pad-square: move a hardware sprite with the joystick (port 2).
-- The sprite is a solid 24x21 MOB (no attribute-clash cost, free sub-cell
-- movement); fire changes its color. Joystick port 2 = player 1.

local x = 76
local y = 96
local col = 7

function _update60()
  if btn(0) then x -= 2 end   -- left
  if btn(1) then x += 2 end   -- right
  if btn(2) then y -= 2 end   -- up
  if btn(3) then y += 2 end   -- down
  if btnp(4) then             -- fire cycles the color
    col += 1
    if col > 15 then col = 1 end
  end
  if x < 0 then x = 0 end
  if x > 152 then x = 152 end
  if y < 0 then y = 0 end
  if y > 179 then y = 179 end
end

function _draw()
  color(col)
  spr(0, x, y)
end
