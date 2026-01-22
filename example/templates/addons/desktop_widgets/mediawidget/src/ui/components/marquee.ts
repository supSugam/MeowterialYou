
import Gtk from 'gi://Gtk?version=3.0';
import GLib from 'gi://GLib?version=2.0';

export type MarqueeDirection = 'left' | 'right';

export class MarqueeComponent {
  public container: Gtk.ScrolledWindow;
  private label1: Gtk.Label;
  private label2: Gtk.Label;
  private adjustment: Gtk.Adjustment;
  private scrollBox: Gtk.Box;

  private offset = 0;
  private waiting = 0;
  private enabled = false;
  private scrollLimit = 0;
  private direction: MarqueeDirection;
  private containerWidth = 0;

  // Config constants
  private readonly PAUSE_FRAMES = 100;
  private readonly GAP = 60;
  private readonly SPEED = 1;

  constructor(className: string, direction: MarqueeDirection = 'left') {
    this.direction = direction;

    this.label1 = new Gtk.Label({
      label: '...',
      halign: Gtk.Align.START,
      wrap: false,
      lines: 1,
    });
    this.label1.get_style_context().add_class(className);

    this.label2 = new Gtk.Label({
      label: '...',
      halign: Gtk.Align.START,
      wrap: false,
      lines: 1,
    });
    this.label2.get_style_context().add_class(className);

    this.scrollBox = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: this.GAP,
    });
    this.scrollBox.pack_start(this.label1, false, false, 0);
    this.scrollBox.pack_start(this.label2, false, false, 0);
    this.scrollBox.halign = Gtk.Align.START; // Always left align

    this.adjustment = new Gtk.Adjustment({
      lower: 0,
      upper: 10000,
      step_increment: 1,
      page_size: 100,
    });

    this.container = new Gtk.ScrolledWindow({
      hscrollbar_policy: Gtk.PolicyType.EXTERNAL,
      vscrollbar_policy: Gtk.PolicyType.NEVER,
      hadjustment: this.adjustment,
    });

    // Critical: Disable natural width propagation to prevent expansion
    this.container.set_propagate_natural_width(false);
    this.container.set_propagate_natural_height(false);

    if (className === 'title') {
      this.container.get_style_context().add_class('title-scroll');
    }

    this.container.add(this.scrollBox);

    // Capture container width once allocated
    this.container.connect('size-allocate', (widget, alloc) => {
      if (this.containerWidth === 0) {
        this.containerWidth = alloc.width;
      }
    });
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

    // Check if we need to scroll after layout settles
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
      const scrollAlloc = this.container.get_allocation();
      const [, nat] = this.label1.get_preferred_width();
      const labelWidth = nat;

      if (labelWidth > scrollAlloc.width) {
        this.enabled = true;
        this.scrollLimit = labelWidth + this.GAP;
        this.label2.show();

        // For right direction, start at max offset
        if (this.direction === 'right') {
          this.offset = this.scrollLimit;
          this.adjustment.set_value(this.offset);
        }
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

    if (this.direction === 'left') {
      this.offset += this.SPEED;
      if (this.offset >= this.scrollLimit) {
        this.offset = 0;
        this.waiting = this.PAUSE_FRAMES;
      }
    } else {
      // Right direction: scroll from max to 0
      this.offset -= this.SPEED;
      if (this.offset <= 0) {
        this.offset = this.scrollLimit;
        this.waiting = this.PAUSE_FRAMES;
      }
    }

    this.adjustment.set_value(this.offset);
  }
}

export const createMarquee = (
  className: string,
  direction: MarqueeDirection = 'left',
) => {
  return new MarqueeComponent(className, direction);
};
