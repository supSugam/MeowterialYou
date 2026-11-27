UUID = meowterialyou@supsugam.github.com
EXT_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
DIST_DIR = $(shell pwd)/dist

.PHONY: all build typecheck schemas install uninstall pack clean nested prefs

all: build

nested:
	@./run-nested.sh

prefs:
	@./open-prefs.sh

build: schemas
	@PATH="$(HOME)/.local/share/pnpm:$(PATH)" pnpm build

typecheck:
	@PATH="$(HOME)/.local/share/pnpm:$(PATH)" pnpm typecheck

schemas:
	glib-compile-schemas schemas/

install: build
	@echo "Installing MeowterialYou extension..."
	@mkdir -p $(HOME)/.local/share/gnome-shell/extensions
	@rm -rf $(EXT_DIR)
	@ln -s $(DIST_DIR) $(EXT_DIR)
	@echo "Extension linked to $(EXT_DIR)"
	@echo "Enable with: gnome-extensions enable $(UUID)"

uninstall:
	@echo "Uninstalling MeowterialYou extension..."
	@rm -rf $(EXT_DIR)
	@echo "Extension unlinked."

pack: build
	@echo "Packaging extension..."
	@cd dist && gnome-extensions pack --force \
		--extra-source=cli.js \
		--extra-source=data \
		--extra-source=icons \
		--extra-source=stylesheet.css \
		--schema=schemas/org.gnome.shell.extensions.meowterialyou.gschema.xml \
		--out-dir=.. \
		.
	@echo "Pack completed -> $(UUID).shell-extension.zip"

clean:
	@rm -rf dist
	@rm -f schemas/gschemas.compiled
	@rm -f $(UUID).shell-extension.zip
