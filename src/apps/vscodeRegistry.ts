/**
 * Registry of major VS Code and VS Code-fork descriptors for verification.
 */

export interface EditorDescriptor {
  id: string;
  name: string;
  dotDir: string;
  configDirName: string;
  binaries: string[];
  productPaths: string[];
}

export const MAJOR_EDITORS: ReadonlyArray<EditorDescriptor> = [
  {
    id: 'vscode',
    name: 'VS Code',
    dotDir: '.vscode',
    configDirName: 'Code',
    binaries: ['code'],
    productPaths: ['/usr/share/code/resources/app/product.json'],
  },
  {
    id: 'vscode-insiders',
    name: 'VS Code Insiders',
    dotDir: '.vscode-insiders',
    configDirName: 'Code - Insiders',
    binaries: ['code-insiders'],
    productPaths: ['/usr/share/code-insiders/resources/app/product.json'],
  },
  {
    id: 'cursor',
    name: 'Cursor',
    dotDir: '.cursor',
    configDirName: 'Cursor',
    binaries: ['cursor'],
    productPaths: [
      '/usr/share/cursor/resources/app/product.json',
      '/opt/cursor/resources/app/product.json',
    ],
  },
  {
    id: 'antigravity-ide',
    name: 'Antigravity IDE',
    dotDir: '.antigravity',
    configDirName: 'Antigravity',
    binaries: [],
    productPaths: [
      '/usr/share/antigravity/resources/app/product.json',
      '/opt/antigravity/resources/app/product.json',
    ],
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    dotDir: '.windsurf',
    configDirName: 'Windsurf',
    binaries: ['windsurf'],
    productPaths: [
      '/usr/share/windsurf/resources/app/product.json',
      '/opt/windsurf/resources/app/product.json',
    ],
  },
  {
    id: 'vscodium',
    name: 'VSCodium',
    dotDir: '.vscode-oss',
    configDirName: 'VSCodium',
    binaries: ['codium'],
    productPaths: [
      '/usr/share/codium/resources/app/product.json',
      '/opt/vscodium/resources/app/product.json',
    ],
  },
  {
    id: 'code-oss',
    name: 'Code - OSS',
    dotDir: '.vscode-oss',
    configDirName: 'Code - OSS',
    binaries: ['code-oss'],
    productPaths: [
      '/usr/lib/code/product.json',
      '/usr/share/code-oss/resources/app/product.json',
    ],
  },
];
