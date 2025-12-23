/**
 * Database Connection and Initialization
 * 
 * Manages SQLite database connection using Bun's built-in SQLite support.
 */

import { Database } from "bun:sqlite";
import { runMigrations } from "./migrations";

let db: Database | null = null;

/**
 * Get the database connection (singleton).
 * Initializes the database if not already initialized.
 */
export function getDatabase(): Database {
  if (!db) {
    const dbPath = process.env.DATABASE_PATH || "data/civil-sarabande.db";
    
    // Ensure the directory exists
    const dbDir = dbPath.substring(0, dbPath.lastIndexOf("/"));
    if (dbDir) {
      try {
        Bun.mkdir(dbDir, { recursive: true });
      } catch (err) {
        // Directory might already exist, ignore
      }
    }

    db = new Database(dbPath);
    db.run("PRAGMA foreign_keys = ON"); // Enable foreign key constraints
    
    // Run migrations
    runMigrations(db);
    
    console.log(`Database initialized at ${dbPath}`);
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

