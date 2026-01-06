// Database connection management for Web2PG
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const { Pool } = pg;

class Database {
  constructor() {
    this.pool = new Pool({
      host: process.env.PG_HOST || 'localhost',
      port: parseInt(process.env.PG_PORT) || 5432,
      database: process.env.PG_DATABASE || 'web',
      user: process.env.PG_USER || 'postgres',
      password: process.env.PG_PASSWORD,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
      // Explicitly set UTF-8 encoding for proper handling of multi-byte characters
      encoding: 'utf8',
      // Set client encoding to UTF-8 for PostgreSQL
      statement_timeout: 10000, // 10 second timeout for queries
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
      process.exit(-1);
    });

    // Log connection status
    this.pool.on('connect', () => {
      console.log('New client connected to PostgreSQL');
    });

    this.pool.on('remove', () => {
      console.log('Client removed from pool');
    });
  }

  // Test database connection
  async testConnection() {
    try {
      const client = await this.pool.connect();

      // Set client encoding to UTF-8 to properly handle multi-byte characters
      await client.query("SET CLIENT_ENCODING TO 'UTF8'");

      const result = await client.query('SELECT NOW()');
      client.release();
      console.log('Database connection successful:', result.rows[0]);
      return true;
    } catch (error) {
      console.error('Database connection failed:', error);
      return false;
    }
  }

  // Execute a query with parameters (always use parameterized queries)
  async query(text, params) {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      console.log('Executed query', { text, duration, rows: result.rowCount });
      return result;
    } catch (error) {
      console.error('Database query error', { text, params, error });
      throw error;
    }
  }

  // Get a client from the pool for transactions
  async getClient() {
    const client = await this.pool.connect();
    return client;
  }

  // Execute a transaction
  async transaction(callback) {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Close all connections in the pool
  async close() {
    await this.pool.end();
    console.log('Database pool closed');
  }

  // Get pool statistics
  getPoolStats() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }
}

// Create a singleton instance
const db = new Database();

// Test connection on startup
db.testConnection();

export default db;
