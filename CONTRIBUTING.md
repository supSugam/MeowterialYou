# Contributing to MeowterialYou

Contributions are welcome. This document outlines the process for contributing to this project.

## Reporting Issues

Before opening an issue, please:

1. Search existing issues to avoid duplicates
2. Use the appropriate issue template
3. Include as much relevant information as possible

### Bug Reports

When reporting bugs, include:

- Your operating system and version
- GNOME Shell version (`gnome-shell --version`)
- Python version (`python3 --version`)
- Steps to reproduce the issue
- Any error messages or logs

Run with logging to capture output:
```bash
meowterialyou --wallpaper /path/to/wallpaper.jpg 2>&1 | tee output.log
```

### Feature Requests

Describe:

- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

## Code Contributions

1. Fork the repository
2. Create a branch for your changes
3. Make your changes
4. Test your changes locally
5. Submit a pull request

### Code Style

- Follow existing code patterns
- Keep changes focused and minimal
- Add comments for non-obvious logic

### Testing

Before submitting:

```bash
# Test installation
./install.sh

# Test theme application
meowterialyou --wallpaper /path/to/test/wallpaper.jpg

# Test uninstallation
./install.sh --uninstall
```

## Adding New Templates

To add support for a new application:

1. Create a template file in `example/templates/`
2. Add the template configuration to `example/config.ini`
3. Use the existing placeholder format: `@{colorName.hex}`, `@{colorName.rgb}`, etc.

## Questions

If you have questions, open an issue with the question label.
