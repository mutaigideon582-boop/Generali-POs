"use strict";

require("dotenv").config();

const express = require("express");
const path = require("path");
const helmet = require("helmet");
const cors = require("cors");

// ------------------------------------------
// Routes
// ------------------------------------------

const { router: authRoutes } = require("./auth");

// If these files exist, they will be loaded.
// We will add/fix the route files in later steps.
let productRoutes = null;
let salesRoutes = null;
let dashboardRoutes = null;

try {
    productRoutes = require("./productRoutes");
} catch (error) {
    console.log("productRoutes not loaded yet.");
}

try {
    salesRoutes = require("./salesRoutes");
} catch (error) {
    console.log("salesRoutes not loaded yet.");
}

try {
    dashboardRoutes = require("./dashboardRoutes");
} catch (error) {
    console.log("dashboardRoutes not loaded yet.");
}


// ------------------------------------------
// Database
// ------------------------------------------

const {
    testDatabase,
    closeDatabase
} = require("./database");


// ------------------------------------------
// Express
// ------------------------------------------

const app = express();


// Render provides PORT automatically.
// Local development uses 3000.
const PORT =
    Number(process.env.PORT || 3000);

const HOST =
    process.env.HOST || "0.0.0.0";


// ------------------------------------------
// Project root
// ------------------------------------------

const PROJECT_ROOT =
    path.resolve(__dirname, "..");


// ------------------------------------------
// Security
// ------------------------------------------

app.disable("x-powered-by");

app.use(
    helmet({
        contentSecurityPolicy: false
    })
);

app.use(
    cors({
        origin: true,
        credentials: true
    })
);


// ------------------------------------------
// Body parsing
// ------------------------------------------

app.use(
    express.json({
        limit: "2mb"
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: "2mb"
    })
);


// ------------------------------------------
// Health check
// ------------------------------------------

app.get(
    "/api/health",
    async (req, res) => {

        res.status(200).json({

            success: true,

            message:
                "Generali POS server is running.",

            environment:
                process.env.NODE_ENV ||
                "development",

            time:
                new Date().toISOString()

        });

    }
);


// ------------------------------------------
// Authentication
// ------------------------------------------

app.use(
    "/api/auth",
    authRoutes
);


// ------------------------------------------
// Products
// ------------------------------------------

if (productRoutes) {

    app.use(
        "/api/products",
        productRoutes
    );

}


// ------------------------------------------
// Sales
// ------------------------------------------

if (salesRoutes) {

    app.use(
        "/api/sales",
        salesRoutes
    );

}


// ------------------------------------------
// Dashboard
// ------------------------------------------

if (dashboardRoutes) {

    app.use(
        "/api/dashboard",
        dashboardRoutes
    );

}


// ------------------------------------------
// Static files
// ------------------------------------------

app.use(
    express.static(
        PROJECT_ROOT,
        {
            index: false
        }
    )
);


// ------------------------------------------
// Main website
// ------------------------------------------

app.get(
    "/",
    (req, res) => {

        res.sendFile(
            path.join(
                PROJECT_ROOT,
                "index.html"
            )
        );

    }
);


// ------------------------------------------
// Explicit HTML pages
// ------------------------------------------

const pages = [
    "login.html",
    "admin.html",
    "cashier.html",
    "dashboard.html"
];


pages.forEach(
    page => {

        app.get(
            `/${page}`,
            (req, res) => {

                res.sendFile(
                    path.join(
                        PROJECT_ROOT,
                        page
                    ),
                    error => {

                        if (error) {

                            console.error(
                                `Unable to load ${page}:`,
                                error
                            );

                            res.status(404).send(
                                `${page} cannot be loaded.`
                            );

                        }

                    }
                );

            }
        );

    }
);


// ------------------------------------------
// API 404
// ------------------------------------------

app.use(
    "/api",
    (req, res) => {

        res.status(404).json({

            success: false,

            message:
                "API endpoint not found.",

            path:
                req.originalUrl

        });

    }
);


// ------------------------------------------
// General error handler
// ------------------------------------------

app.use(
    (error, req, res, next) => {

        console.error(
            "SERVER ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "Internal server error."

        });

    }
);


// ------------------------------------------
// Start server
// ------------------------------------------

let server;


async function startServer() {

    console.log("");
    console.log(
        "======================================"
    );
    console.log(
        "        GENERALI POS SYSTEM"
    );
    console.log(
        "======================================"
    );

    console.log(
        "Environment:",
        process.env.NODE_ENV ||
        "development"
    );

    console.log(
        "Project root:",
        PROJECT_ROOT
    );


    // --------------------------------------
    // Test database
    // --------------------------------------

    const databaseReady =
        await testDatabase();


    if (!databaseReady) {

        console.error(
            "Database connection failed."
        );

        process.exit(1);

    }


    // --------------------------------------
    // Start HTTP server
    // --------------------------------------

    server =
        app.listen(
            PORT,
            HOST,
            () => {

                console.log("");

                console.log(
                    "Server running on:"
                );

                console.log(
                    `http://localhost:${PORT}`
                );

                console.log("");

                console.log(
                    "Health check:"
                );

                console.log(
                    `http://localhost:${PORT}/api/health`
                );

                console.log("");

                console.log(
                    "======================================"
                );

            }
        );

}


// ------------------------------------------
// Graceful shutdown
// ------------------------------------------

async function shutdown() {

    console.log(
        "Shutting down Generali POS..."
    );


    if (server) {

        server.close(
            async () => {

                try {

                    await closeDatabase();

                } catch (error) {

                    console.error(
                        "Database shutdown error:",
                        error
                    );

                }

                process.exit(0);

            }
        );

    } else {

        try {

            await closeDatabase();

        } catch (error) {

            console.error(
                error
            );

        }

        process.exit(0);

    }

}


process.on(
    "SIGINT",
    shutdown
);

process.on(
    "SIGTERM",
    shutdown
);


// ------------------------------------------
// Start application
// ------------------------------------------

startServer();
