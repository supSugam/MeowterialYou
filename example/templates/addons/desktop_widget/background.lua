--[[
Rounded Rectangle Background for MeowterialYou Widget
Uses Cairo to draw rounded corners
]]

require 'cairo'

function conky_draw_background()
    if conky_window == nil then return end
    
    local corner_radius = @{CORNER_RADIUS}
    local bg_r = @{BG_R}
    local bg_g = @{BG_G}
    local bg_b = @{BG_B}
    local bg_a = @{BG_A}
    
    -- Skip if fully transparent
    if bg_a <= 0 then return end
    
    local cs = cairo_xlib_surface_create(
        conky_window.display,
        conky_window.drawable,
        conky_window.visual,
        conky_window.width,
        conky_window.height
    )
    local cr = cairo_create(cs)
    
    local w = conky_window.width
    local h = conky_window.height
    local r = corner_radius
    
    if r > w / 2 then r = w / 2 end
    if r > h / 2 then r = h / 2 end
    
    -- Draw rounded rectangle
    cairo_new_path(cr)
    cairo_arc(cr, r, r, r, math.pi, 1.5 * math.pi)
    cairo_arc(cr, w - r, r, r, 1.5 * math.pi, 2 * math.pi)
    cairo_arc(cr, w - r, h - r, r, 0, 0.5 * math.pi)
    cairo_arc(cr, r, h - r, r, 0.5 * math.pi, math.pi)
    cairo_close_path(cr)
    
    cairo_set_source_rgba(cr, bg_r, bg_g, bg_b, bg_a)
    cairo_fill(cr)
    
    cairo_destroy(cr)
    cairo_surface_destroy(cs)
end
