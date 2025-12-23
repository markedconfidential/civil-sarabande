/**
 * Database Connection and Initialization
 * 
 * Manages SQLite database connection using Bun's built-in SQLite support.
 */

import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { runMigrations } from "./migrations";

let db: Database | null = null;

/**
 * Get the database connection (singleton).
 * Initializes the database if not already initialized.
 */
export function getDatabase(): Database {
  if (!db) {
    // Resolve database path - use absolute path relative to server package
    let dbPath = process.env.DATABASE_PATH;
    
    if (!dbPath) {
      // Get the server package directory (go up from src/db to server package root)
      const serverDir = import.meta.dir + "/../..";
      dbPath = `${serverDir}/data/civil-sarabande.db`;
    }
    
    // Ensure the directory exists
    const dbDir = dirname(dbPath);
    try {
      mkdirSync(dbDir, { recursive: true });
      console.log(`Database directory created/verified: ${dbDir}`);
    } catch (err) {
      console.error(`Failed to create database directory: ${dbDir}`, err);
      throw new Error(`Cannot create database directory: ${dbDir}`);
    }

    try {
      db = new Database(dbPath);
      db.run("PRAGMA foreign_keys = ON"); // Enable foreign key constraints
      
      // Run migrations
      runMigrations(db);
      
      console.log(`Database initialized at ${dbPath}`);
    } catch (err) {
      console.error(`Failed to open database at ${dbPath}:`, err);
      throw err;
    }
  }
  
  return db;
}

/**
 * Close the database connection.
 * Should be called on server shutdown.
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    console.log("Database connection closed");
  }
}

/**
 * Get a fresh database connection (for testing).
 */
export function getTestDatabase(): Database {
  // Use in-memory database for tests
  const testDb = new Database(":memory:");
  testDb.run("PRAGMA foreign_keys = ON");
  runMigrations(testDb);
  return testDb;
}

