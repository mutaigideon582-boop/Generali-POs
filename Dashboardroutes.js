"use strict";

const express = require("express");

const {
    query
} = require("./database");

const {
    authenticate
} = require("./auth");


const router = express.Router();


// ======================================================
// ADMIN ONLY
// ======================================================

function requireAdmin(req, res, next) {

    if (
        !req.user ||
        req.user.role !== "admin"
    ) {

        return res.status(403).json({

            success: false,

            message:
                "Administrator access required."

        });

    }

    next();

}


// ======================================================
// ADMIN SUMMARY
// GET /api/dashboard/admin-summary
// ======================================================

router.get(
    "/admin-summary",
    authenticate,
    requireAdmin,
    async (req, res) => {

        try {

            const result =
                await query(

                    `
                    SELECT

                        (
                            SELECT COUNT(*)
                            FROM products
                            WHERE is_active = TRUE
                        ) AS total_products,

                        (
                            SELECT COALESCE(
                                SUM(quantity),
                                0
                            )
                            FROM products
                            WHERE is_active = TRUE
                        ) AS total_stock,

                        (
                            SELECT COALESCE(
                                SUM(total_amount),
                                0
                            )
                            FROM sales
                            WHERE
                                status = 'completed'
                                AND
                                created_at >= CURRENT_DATE
                        ) AS today_sales,

                        (
                            SELECT COUNT(*)
                            FROM sales
                            WHERE
                                status = 'completed'
                                AND
                                created_at >= CURRENT_DATE
                        ) AS today_transactions,

                        (
                            SELECT COUNT(*)
                            FROM user_sessions s

                            INNER JOIN users u
                                ON u.id = s.user_id

                            WHERE
                                u.role = 'cashier'

                                AND
                                u.is_active = TRUE

                                AND
                                s.expires_at > NOW()
                        ) AS active_cashiers,

                        (
                            SELECT COUNT(*)
                            FROM user_sessions s

                            INNER JOIN users u
                                ON u.id = s.user_id

                            WHERE
                                u.role = 'admin'

                                AND
                                u.is_active = TRUE

                                AND
                                s.expires_at > NOW()
                        ) AS active_admins
                    `

                );


            const row =
                result.rows[0];


            return res.json({

                success: true,

                summary: {

                    totalProducts:
                        Number(
                            row.total_products
                        ),

                    totalStock:
                        Number(
                            row.total_stock
                        ),

                    todaySales:
                        Number(
                            row.today_sales
                        ),

                    todayTransactions:
                        Number(
                            row.today_transactions
                        ),

                    activeCashiers:
                        Number(
                            row.active_cashiers
                        ),

                    activeAdmins:
                        Number(
                            row.active_admins
                        )

                }

            });

        }

        catch (error) {

            console.error(
                "ADMIN SUMMARY ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to load dashboard summary."

            });

        }

    }
);


// ======================================================
// ACTIVE USERS
// GET /api/dashboard/active-users
// ======================================================

router.get(
    "/active-users",
    authenticate,
    requireAdmin,
    async (req, res) => {

        try {

            const result =
                await query(

                    `
                    SELECT

                        COUNT(*)
                        FILTER (
                            WHERE u.role = 'admin'
                        ) AS admins,

                        COUNT(*)
                        FILTER (
                            WHERE u.role = 'cashier'
                        ) AS cashiers

                    FROM user_sessions s

                    INNER JOIN users u
                        ON u.id = s.user_id

                    WHERE
                        u.is_active = TRUE

                        AND
                        s.expires_at > NOW()
                    `

                );


            const row =
                result.rows[0];


            return res.json({

                success: true,

                active: {

                    admins:
                        Number(
                            row.admins
                        ),

                    cashiers:
                        Number(
                            row.cashiers
                        )

                }

            });

        }

        catch (error) {

            console.error(
                "ACTIVE USERS ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to load active users."

            });

        }

    }
);


// ======================================================
// SALES SUMMARY
// GET /api/dashboard/sales-summary
// ======================================================

router.get(
    "/sales-summary",
    authenticate,
    requireAdmin,
    async (req, res) => {

        try {

            const days =
                Math.min(
                    Math.max(
                        Number(
                            req.query.days || 7
                        ),
                        1
                    ),
                    90
                );


            const result =
                await query(

                    `
                    SELECT

                        DATE(created_at)
                        AS sale_date,

                        COUNT(*)::INTEGER
                        AS transactions,

                        COALESCE(
                            SUM(total_amount),
                            0
                        ) AS sales

                    FROM sales

                    WHERE
                        status = 'completed'

                        AND
                        created_at >=
                            CURRENT_DATE -
                            ($1::INTEGER - 1)

                    GROUP BY
                        DATE(created_at)

                    ORDER BY
                        sale_date ASC
                    `,

                    [
                        days
                    ]

                );


            return res.json({

                success: true,

                days,

                sales:
                    result.rows.map(
                        row => ({

                            date:
                                row.sale_date,

                            transactions:
                                Number(
                                    row.transactions
                                ),

                            sales:
                                Number(
                                    row.sales
                                )

                        })
                    )

            });

        }

        catch (error) {

            console.error(
                "SALES SUMMARY ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to load sales summary."

            });

        }

    }
);


// ======================================================
// LOW STOCK
// GET /api/dashboard/low-stock
// ======================================================

router.get(
    "/low-stock",
    authenticate,
    requireAdmin,
    async (req, res) => {

        try {

            const result =
                await query(

                    `
                    SELECT

                        id,
                        barcode,
                        name,
                        quantity,
                        minimum_stock,
                        selling_price,
                        category

                    FROM products

                    WHERE
                        is_active = TRUE

                        AND
                        quantity <= minimum_stock

                    ORDER BY
                        quantity ASC,
                        name ASC

                    LIMIT 100
                    `

                );


            return res.json({

                success: true,

                products:
                    result.rows

            });

        }

        catch (error) {

            console.error(
                "LOW STOCK ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to load low-stock products."

            });

        }

    }
);


// ======================================================
// TOP SELLING PRODUCTS
// GET /api/dashboard/top-products
// ======================================================

router.get(
    "/top-products",
    authenticate,
    requireAdmin,
    async (req, res) => {

        try {

            const limit =
                Math.min(
                    Math.max(
                        Number(
                            req.query.limit || 10
                        ),
                        1
                    ),
                    50
                );


            const result =
                await query(

                    `
                    SELECT

                        si.product_id,

                        si.product_name,

                        SUM(
                            si.quantity
                        )::INTEGER AS quantity_sold,

                        COALESCE(
                            SUM(
                                si.total_price
                            ),
                            0
                        ) AS revenue

                    FROM sale_items si

                    INNER JOIN sales s
                        ON s.id = si.sale_id

                    WHERE
                        s.status = 'completed'

                        AND
                        s.created_at >=
                            CURRENT_DATE - INTERVAL '30 days'

                    GROUP BY
                        si.product_id,
                        si.product_name

                    ORDER BY
                        quantity_sold DESC

                    LIMIT $1
                    `,

                    [
                        limit
                    ]

                );


            return res.json({

                success: true,

                products:
                    result.rows.map(
                        row => ({

                            productId:
                                row.product_id,

                            name:
                                row.product_name,

                            quantitySold:
                                Number(
                                    row.quantity_sold
                                ),

                            revenue:
                                Number(
                                    row.revenue
                                )

                        })
                    )

            });

        }

        catch (error) {

            console.error(
                "TOP PRODUCTS ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to load top products."

            });

        }

    }
);


// ======================================================
// CASHIER PERFORMANCE
// GET /api/dashboard/cashiers
// ======================================================

router.get(
    "/cashiers",
    authenticate,
    requireAdmin,
    async (req, res) => {

        try {

            const result =
                await query(

                    `
                    SELECT

                        u.id,

                        u.username,

                        u.full_name,

                        u.is_active,

                        COUNT(
                            s.id
                        ) FILTER (
                            WHERE
                                s.status =
                                'completed'

                                AND
                                s.created_at >=
                                CURRENT_DATE
                        )::INTEGER
                        AS today_transactions,

                        COALESCE(
                            SUM(
                                s.total_amount
                            ) FILTER (
                                WHERE
                                    s.status =
                                    'completed'

                                    AND
                                    s.created_at >=
                                    CURRENT_DATE
                            ),
                            0
                        ) AS today_sales,

                        EXISTS (

                            SELECT 1

                            FROM user_sessions us

                            WHERE
                                us.user_id = u.id

                                AND
                                us.expires_at > NOW()

                        ) AS currently_logged_in

                    FROM users u

                    LEFT JOIN sales s
                        ON s.cashier_id = u.id

                    WHERE
                        u.role = 'cashier'

                    GROUP BY
                        u.id

                    ORDER BY
                        today_sales DESC
                    `

                );


            return res.json({

                success: true,

                cashiers:
                    result.rows.map(
                        row => ({

                            id:
                                row.id,

                            username:
                                row.username,

                            name:
                                row.full_name,

                            active:
                                row.is_active,

                            loggedIn:
                                row.currently_logged_in,

                            todayTransactions:
                                Number(
                                    row.today_transactions
                                ),

                            todaySales:
                                Number(
                                    row.today_sales
                                )

                        })
                    )

            });

        }

        catch (error) {

            console.error(
                "CASHIER PERFORMANCE ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to load cashier information."

            });

        }

    }
);


// ======================================================
// RECENT SALES
// GET /api/dashboard/recent-sales
// ======================================================

router.get(
    "/recent-sales",
    authenticate,
    requireAdmin,
    async (req, res) => {

        try {

            const limit =
                Math.min(
                    Math.max(
                        Number(
                            req.query.limit || 20
                        ),
                        1
                    ),
                    100
                );


            const result =
                await query(

                    `
                    SELECT

                        s.id,

                        s.receipt_number,

                        s.total_amount,

                        s.status,

                        s.created_at,

                        u.username
                            AS cashier_username,

                        u.full_name
                            AS cashier_name,

                        p.payment_method,

                        p.status
                            AS payment_status

                    FROM sales s

                    LEFT JOIN users u
                        ON u.id = s.cashier_id

                    LEFT JOIN payments p
                        ON p.sale_id = s.id

                    ORDER BY
                        s.created_at DESC

                    LIMIT $1
                    `,

                    [
                        limit
                    ]

                );


            return res.json({

                success: true,

                sales:
                    result.rows

            });

        }

        catch (error) {

            console.error(
                "RECENT SALES ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to load recent sales."

            });

        }

    }
);


// ======================================================
// DATABASE HEALTH
// GET /api/dashboard/health
// ======================================================

router.get(
    "/health",
    authenticate,
    requireAdmin,
    async (req, res) => {

        try {

            await query(
                "SELECT 1"
            );


            return res.json({

                success: true,

                database:
                    "connected",

                serverTime:
                    new Date().toISOString()

            });

        }

        catch (error) {

            return res.status(503).json({

                success: false,

                database:
                    "unavailable"

            });

        }

    }
);


// ======================================================
// EXPORT
// ======================================================

module.exports = router;
