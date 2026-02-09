/**
 * File-Based Database Discovery
 * Find SQLite, Access, and other file-based databases on disk
 */

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const access = promisify(fs.access);

export interface FileDatabase {
  type: 'sqlite' | 'access' | 'unknown';
  path: string;
  name: string;
  size: number;
  modified: Date;
  accessible: boolean;
}

const SQLITE_EXTENSIONS = ['.db', '.sqlite', '.sqlite3', '.db3'];
const ACCESS_EXTENSIONS = ['.mdb', '.accdb'];
const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1GB limit for safety

/**
 * Search for database files in specified directories
 */
export async function findDatabaseFiles(
  searchPaths: string[],
  maxDepth: number = 3,
  maxFiles: number = 100
): Promise<FileDatabase[]> {
  const foundFiles: FileDatabase[] = [];
  const visited = new Set<string>();

  for (const searchPath of searchPaths) {
    try {
      await searchDirectory(searchPath, 0, maxDepth, foundFiles, visited, maxFiles);
      
      if (foundFiles.length >= maxFiles) {
        break;
      }
    } catch (error) {
      console.error(`Error searching ${searchPath}:`, error);
    }
  }

  return foundFiles;
}

async function searchDirectory(
  dirPath: string,
  currentDepth: number,
  maxDepth: number,
  results: FileDatabase[],
  visited: Set<string>,
  maxFiles: number
): Promise<void> {
  if (currentDepth > maxDepth || results.length >= maxFiles) {
    return;
  }

  // Avoid infinite loops from symlinks
  const realPath = fs.realpathSync(dirPath);
  if (visited.has(realPath)) {
    return;
  }
  visited.add(realPath);

  // Skip system directories
  if (isSystemDirectory(dirPath)) {
    return;
  }

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (results.length >= maxFiles) {
        break;
      }

      const fullPath = path.join(dirPath, entry.name);

      try {
        if (entry.isDirectory()) {
          // Recurse into subdirectories
          await searchDirectory(fullPath, currentDepth + 1, maxDepth, results, visited, maxFiles);
        } else if (entry.isFile()) {
          // Check if it's a database file
          const dbFile = await checkDatabaseFile(fullPath);
          if (dbFile) {
            results.push(dbFile);
          }
        }
      } catch (error) {
        // Skip files/directories we can't access
        continue;
      }
    }
  } catch (error) {
    // Skip directories we can't read
    return;
  }
}

/**
 * Check if a file is a database file
 */
async function checkDatabaseFile(filePath: string): Promise<FileDatabase | null> {
  const ext = path.extname(filePath).toLowerCase();
  
  // Check extension
  let type: 'sqlite' | 'access' | 'unknown' = 'unknown';
  
  if (SQLITE_EXTENSIONS.includes(ext)) {
    type = 'sqlite';
  } else if (ACCESS_EXTENSIONS.includes(ext)) {
    type = 'access';
  } else {
    return null;
  }

  try {
    // Get file stats
    const stats = await stat(filePath);

    // Skip files that are too large
    if (stats.size > MAX_FILE_SIZE) {
      return null;
    }

    // Check if we can access the file
    let accessible = true;
    try {
      await access(filePath, fs.constants.R_OK);
    } catch {
      accessible = false;
    }

    // Validate it's actually a database file
    if (type === 'sqlite') {
      const isValid = await validateSqliteFile(filePath);
      if (!isValid) {
        return null;
      }
    }

    return {
      type,
      path: filePath,
      name: path.basename(filePath),
      size: stats.size,
      modified: stats.mtime,
      accessible,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Validate that a file is actually a SQLite database
 */
async function validateSqliteFile(filePath: string): Promise<boolean> {
  try {
    // Read first 16 bytes to check SQLite header
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(16);
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);

    // SQLite files start with "SQLite format 3\0"
    const header = buffer.toString('utf8', 0, 15);
    return header === 'SQLite format 3';
  } catch (error) {
    return false;
  }
}

/**
 * Check if directory should be skipped
 */
function isSystemDirectory(dirPath: string): boolean {
  const normalizedPath = dirPath.toLowerCase();
  
  const systemDirs = [
    'windows',
    'program files',
    'program files (x86)',
    'programdata',
    'system32',
    'syswow64',
    '$recycle.bin',
    'node_modules',
    '.git',
    '.next',
    'dist',
    'build',
  ];

  return systemDirs.some(sysDir => normalizedPath.includes(sysDir));
}

/**
 * Get default search paths based on OS
 */
export function getDefaultSearchPaths(): string[] {
  const platform = process.platform;
  
  if (platform === 'win32') {
    // Windows
    const userProfile = process.env.USERPROFILE || 'C:\\Users\\Default';
    return [
      path.join(userProfile, 'Documents'),
      path.join(userProfile, 'Desktop'),
      path.join(userProfile, 'Downloads'),
      'D:\\', // Common data drive
    ];
  } else if (platform === 'darwin') {
    // macOS
    const home = process.env.HOME || '/Users/default';
    return [
      path.join(home, 'Documents'),
      path.join(home, 'Desktop'),
      path.join(home, 'Downloads'),
    ];
  } else {
    // Linux
    const home = process.env.HOME || '/home/default';
    return [
      path.join(home, 'Documents'),
      path.join(home, 'Desktop'),
      path.join(home, 'Downloads'),
      '/var/lib',
    ];
  }
}

/**
 * Get SQLite metadata without connecting
 */
export async function getSqliteMetadata(filePath: string): Promise<{
  size: number;
  modified: Date;
  tables: number;
  version: string;
} | null> {
  try {
    const stats = await stat(filePath);
    
    // Would need sqlite3 library to get table count and version
    // For now, return basic info
    return {
      size: stats.size,
      modified: stats.mtime,
      tables: 0, // Would query sqlite_master
      version: '3.x', // Would query PRAGMA user_version
    };
  } catch (error) {
    return null;
  }
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
