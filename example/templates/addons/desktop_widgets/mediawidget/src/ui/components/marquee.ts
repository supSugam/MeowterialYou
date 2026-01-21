
import Gtk from 'gi://Gtk?version=3.0';
import GLib from 'gi://GLib?version=2.0';
import Pango from 'gi://Pango?version=1.0';

export class MarqueeComponent {
    public container: Gtk.Box;
    private label1: Gtk.Label;
    private label2: Gtk.Label;
    private scroll: Gtk.ScrolledWindow;
    private adjustment: Gtk.Adjustment;
    private scrollBox: Gtk.Box;
    
    private offset = 0;
    private waiting = 0;
    private enabled = false;
    private scrollLimit = 0;
    
    // Config constants
    private readonly PAUSE_FRAMES = 100;
    private readonly GAP = 60;
    
    constructor(className: string) {
        this.label1 = new Gtk.Label({ label: '...', halign: Gtk.Align.START, wrap: false, lines: 1 });
        this.label1.get_style_context().add_class(className);
        
        this.label2 = new Gtk.Label({ label: '...', halign: Gtk.Align.START, wrap: false, lines: 1 });
        this.label2.get_style_context().add_class(className);
        
        this.scrollBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: this.GAP });
        this.scrollBox.pack_start(this.label1, false, false, 0);
        this.scrollBox.pack_start(this.label2, false, false, 0);
        
        this.adjustment = new Gtk.Adjustment({ lower: 0, upper: 1000, step_increment: 1, page_size: 100 });
        
        this.scroll = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.EXTERNAL,
            vscrollbar_policy: Gtk.PolicyType.NEVER,
            hadjustment: this.adjustment,
            hexpand: true,
            width_request: 50 // Minimum constraint to prevent expansion
        });
        
        if (className === 'title') {
             this.scroll.get_style_context().add_class('title-scroll');
        }
        
        this.scroll.add(this.scrollBox);
        
        // This container can be packed into parent
        // Use a Box wrapper if needed, but ScrolledWindow is a container.
        // We'll return a box wrapper to be safe or just the scroll.
        // Let's return a simple structure.
        this.container = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
        this.container.pack_start(this.scroll, true, true, 0);
    }
    
    public setText(text: string) {
        this.label1.label = text;
        this.label2.label = text;
        this.reset();
    }
    
    private reset() {
        this.offset = 0;
        this.waiting = this.PAUSE_FRAMES;
        this.adjustment.set_value(0);
        this.enabled = false;
        this.label2.hide();
        this.scrollBox.halign = Gtk.Align.START; // Always left align
        
        // Check if we need to scroll
        // Give GTK a moment to layout the new text
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            const scrollAlloc = this.scroll.get_allocation();
            // Using natural width for label ideally
            const [min, nat] = this.label1.get_preferred_width();
            const labelWidth = nat; 
            
            if (labelWidth > scrollAlloc.width) {
                this.enabled = true;
                this.scrollLimit = labelWidth + this.GAP;
                this.label2.show();
                this.scrollBox.halign = Gtk.Align.START; // Left align for scrolling
            }
            return false;
        });
    }
    
    public tick() {
        if (!this.enabled) return;
        
        if (this.waiting > 0) {
            this.waiting--;
            return;
        }
        
        this.offset += 1; // Speed
        if (this.offset >= this.scrollLimit) {
            this.offset = 0;
            this.waiting = this.PAUSE_FRAMES;
        }
        
        this.adjustment.set_value(this.offset);
    }
}

export const createMarquee = (className: string) => {
    return new MarqueeComponent(className);
};
