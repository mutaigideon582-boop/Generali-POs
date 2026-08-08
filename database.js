"use strict";

const { Pool } = require("pg");


// ==========================================
// DATABASE CONFIGURATION
// ==========================================
//
// Production:
// DATABASE_URL is provided by Render/PostgreSQL.
//
// Local:
// You can use DB_HOST, DB_PORT, DB_NAME,
// DB_USER and DB_PASSWORD.
//

const isProduction =
    process.env.NODE_ENV === "production";


let poolConfig;


// ==========================================
// PRODUCTION DATABASE
// ==========================================

if (
    process.env.DATABASE_URL
) {

    poolConfig = {

        connectionString:
            process.env.DATABASE_URL,

        ssl:
            isProduction
                ? {
                    rejectUnauthorized: false
                }
                : false,

        max: 20,

        idleTimeoutMillis:
            30000,

        connectionTimeoutMillis:
            10000

    };

}


// ==========================================
// LOCAL DATABASE
// ==========================================

else {

    poolConfig = {

        host:
            process.env.DB_HOST ||
            "localhost",

        port:
            Number(
                process.env.DB_PORT ||
                5432
            ),

        database:
            process.env.DB_NAME ||
            "generali_pos",

        user:
            process.env.DB_USER ||
            "postgres",

        password:
            process.env.DB_PASSWORD ||
            "",

        max: 20,

        idleTimeoutMillis:
            30000,

        connectionTimeoutMillis:
            10000

    };

}


// ==========================================
// CREATE POOL
// ==========================================

const pool =
    new Pool(
        poolConfig
    );


// ==========================================
// ERROR HANDLER
// ==========================================

pool.on(
    "error",
    error => {

        console.error(
            "Unexpected PostgreSQL error:",
            error
        );

    }
);


// ==========================================
// TEST DATABASE
// ==========================================

async function testDatabase() {

    let client;


    try {

        client =
            await pool.connect();


        const result =
            await client.query(
                "SELECT NOW() AS time"
            );


        console.log(
            "PostgreSQL connected successfully."
        );


        console.log(
            "Database time:",
            result.rows[0].time
        );


        return true;

    }

    catch (error) {

        console.error(
            "PostgreSQL connection failed:"
        );


        console.error(
            error.message
        );


        return false;

    }

    finally {

        if (client) {

            client.release();

        }

    }

}


// ==========================================
// QUERY HELPER
// ==========================================

async function query(
    text,
    params = []
) {

    const start =
        Date.now();


    try {

        const result =
            await pool.query(
                text,
                params
            );


        const duration =
            Date.now() -
            start;


        console.log(
            "DB query:",
            {
                duration,
                rows:
                    result.rowCount
            }
        );


        return result;

    }

    catch (error) {

        console.error(
            "Database query failed:",
            error.message
        );


        throw error;

    }

}


// ==========================================
// TRANSACTION HELPER
// ==========================================

async function transaction(
    callback
) {

    const client =
        await pool.connect();


    try {

        await client.query(
            "BEGIN"
        );


        const result =
            await callback(
                client
            );


        await client.query(
            "COMMIT"
        );


        return result;

    }

    catch (error) {

        await client.query(
            "ROLLBACK"
        );


        throw error;

    }

    finally {

        client.release();

    }

}


// ==========================================
// CLOSE DATABASE
// ==========================================

async function closeDatabase() {

    try {

        await pool.end();

        console.log(
            "PostgreSQL connection pool closed."
        );

    }

    catch (error) {

        console.error(
            "Error closing PostgreSQL:",
            error
        );

    }

}


// ==========================================
// EXPORT
// ==========================================

module.exports = {

    pool,

    query,

    transaction,

    testDatabase,

    closeDatabase

};
