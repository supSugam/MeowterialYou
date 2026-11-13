/**
 * About and credits preferences page.
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

export function createAboutPage(): Adw.PreferencesPage {
  const page = new Adw.PreferencesPage({
    title: 'About',
    icon_name: 'help-about-symbolic',
  });

  const group = new Adw.PreferencesGroup({
    title: 'MeowterialYou',
    description: 'Dynamic Material You desktop theming for GNOME Shell',
  });
  page.add(group);

  const versionRow = new Adw.ActionRow({
    title: 'Version',
    subtitle: '1.0.0 (Native GNOME Shell Extension)',
  });
  group.add(versionRow);

  const authorRow = new Adw.ActionRow({
    title: 'Author',
    subtitle: 'supSugam (github.com/supSugam)',
  });
  group.add(authorRow);

  const githubRow = new Adw.ActionRow({
    title: 'Source Code',
    subtitle: 'https://github.com/supSugam/MeowterialYou',
  });
  const openLinkButton = new Gtk.LinkButton({
    label: 'GitHub',
    uri: 'https://github.com/supSugam/MeowterialYou',
    valign: Gtk.Align.CENTER,
  });
  githubRow.add_suffix(openLinkButton);
  group.add(githubRow);

  const creditsGroup = new Adw.PreferencesGroup({
    title: 'Credits & Attributions',
    description: 'Built upon Google Material Color Utilities, Mitsugen, and Adwaita',
  });
  page.add(creditsGroup);

  const credits = [
    { title: 'Google Material Color Utilities', desc: 'HCT color space, Celebi quantizer & scoring algorithm' },
    { title: 'Mitsugen by Dimitris Milonopoulos', desc: 'Original Linux Material You concept & template foundations' },
    { title: 'GNOME Shell & Libadwaita', desc: 'Native desktop environment & widget ecosystem' },
  ];

  for (const credit of credits) {
    const row = new Adw.ActionRow({
      title: credit.title,
      subtitle: credit.desc,
    });
    creditsGroup.add(row);
  }

  return page;
}
