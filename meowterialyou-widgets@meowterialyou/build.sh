#!/bin/bash
set -e

echo "🔨 Building MeowterialYou Widgets extension..."

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Build TypeScript
echo "📝 Compiling TypeScript..."
npm run build

# Compile GSettings schemas
echo "⚙️  Compiling GSettings schemas..."
npm run compile-schemas

# Install extension
echo "📂 Installing extension..."
npm run install-extension

echo "✅ Build complete!"
echo ""
echo "To apply changes:"
echo "  • On X11: Press Alt+F2, type 'r', press Enter"
echo "  • On Wayland: Log out and log back in"
