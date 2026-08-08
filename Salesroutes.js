"use strict";

const express = require("express");
const { authenticate } = require("./auth");
const { query, transaction } = require("./database");

const router = express.Router();


// ======================================================
// HELPERS
// ======================================================

function requireStaff(req, res, next) {
    if (
        !req.user ||
        !["admin", "cashier"].includes(req.user.role)
    ) {
        return res.status(403).json({
            success: false,
            message: "Staff access required."
        });
    }

    next();
}


function generateReceiptNumber() {
    const now = new Date();

    const date =
        now.toISOString()
            .replace(/\D/g, "")
            .slice(0, 14);

    const random =
        Math.floor(1000 + Math.random() * 9000);

    return `GEN-${date}-${random}`;
}


function normalizeItems(items) {
    if (!Array.isArray(items)) {
        return [];
    }

    return items
        .map(item => ({
            product_id: Number(item.product_id),
            barcode: String(item.barcode || "").trim(),
            quantity: Number(item.quantity)
        }))
        .filter(item =>
            Number.isInteger(item.product_id) &&
            Number.isInteger(item.quantity) &&
            item.quantity > 0
        );
}


// ======================================================
// CREATE CASH SALE
// ======================================================

router.post(
    "/",
    authenticate,
    requireStaff,
    async (req, res) => {

        try {

            const items =
                normalizeItems(
                    req.body.items
                );

            const paymentMethod =
                String(
                    req.body.payment_method || "cash"
                ).toLowerCase();

            const amountReceived =
                Number(
                    req.body.amount_received || 0
                );


            if (items.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "No products were supplied."
                });
            }


            if (paymentMethod !== "cash") {
                return res.status(400).json({
                    success: false,
                    message: "This endpoint is for cash payments."
                });
            }


            const sale =
                await transaction(
                    async client => {

                        let subtotal = 0;

                        const saleItems = [];


                        // ----------------------------------
                        // Lock products while checking stock
                        // ----------------------------------

                        for (const item of items) {

                            const result =
                                await client.query(

                                    `
                                    SELECT
                                        id,
                                        barcode,
                                        name,
                                        selling_price,
                                        quantity,
                                        is_active

                                    FROM products

                                    WHERE id = $1

                                    FOR UPDATE
                                    `,

                                    [
                                        item.product_id
                                    ]

                                );


                            if (
                                result.rows.length === 0
                            ) {

                                throw new Error(
                                    "PRODUCT_NOT_FOUND"
                                );

                            }


                            const product =
                                result.rows[0];


                            if (
                                !product.is_active
                            ) {

                                throw new Error(
                                    `PRODUCT_INACTIVE:${product.name}`
                                );

                            }


                            const stock =
                                Number(
                                    product.quantity
                                );


                            if (
                                item.quantity > stock
                            ) {

                                throw new Error(
                                    `INSUFFICIENT_STOCK:${product.name}:${stock}`
                                );

                            }


                            const unitPrice =
                                Number(
                                    product.selling_price
                                );


                            const totalPrice =
                                unitPrice *
                                item.quantity;


                            subtotal +=
                                totalPrice;


                            saleItems.push({

                                product,

                                quantity:
                                    item.quantity,

                                unitPrice,

                                totalPrice

                            });

                        }


                        const totalAmount =
                            Number(
                                subtotal.toFixed(2)
                            );


                        if (
                            amountReceived <
                            totalAmount
                        ) {

                            throw new Error(
                                "INSUFFICIENT_PAYMENT"
                            );

                        }


                        const change =
                            Number(
                                (
                                    amountReceived -
                                    totalAmount
                                ).toFixed(2)
                            );


                        // ----------------------------------
                        // Generate receipt
                        // ----------------------------------

                        let receiptNumber;

                        let receiptCreated =
                            false;


                        for (
                            let attempt = 0;
                            attempt < 5;
                            attempt++
                        ) {

                            try {

                                receiptNumber =
                                    generateReceiptNumber();


                                const saleResult =
                                    await client.query(

                                        `
                                        INSERT INTO sales
                                        (
                                            receipt_number,
                                            cashier_id,
                                            subtotal,
                                            discount,
                                            tax,
                                            total_amount,
                                            status,
                                            completed_at
                                        )

                                        VALUES
                                        (
                                            $1,
                                            $2,
                                            $3,
                                            0,
                                            0,
                                            $4,
                                            'completed',
                                            NOW()
                                        )

                                        RETURNING *
                                        `,

                                        [

                                            receiptNumber,

                                            req.user.id,

                                            totalAmount,

                                            totalAmount

                                        ]

                                    );


                                const createdSale =
                                    saleResult.rows[0];


                                receiptCreated =
                                    true;


                                // --------------------------
                                // Sale items
                                // --------------------------

                                for (
                                    const item
                                    of saleItems
                                ) {

                                    await client.query(

                                        `
                                        INSERT INTO sale_items
                                        (
                                            sale_id,
                                            product_id,
                                            barcode,
                                            product_name,
                                            quantity,
                                            unit_price,
                                            discount,
                                            total_price
                                        )

                                        VALUES
                                        (
                                            $1,
                                            $2,
                                            $3,
                                            $4,
                                            $5,
                                            $6,
                                            0,
                                            $7
                                        )
                                        `,

                                        [

                                            createdSale.id,

                                            item.product.id,

                                            item.product.barcode,

                                            item.product.name,

                                            item.quantity,

                                            item.unitPrice,

                                            item.totalPrice

                                        ]

                                    );


                                    // --------------------------
                                    // Deduct stock
                                    // --------------------------

                                    const before =
                                        Number(
                                            item.product.quantity
                                        );


                                    const after =
                                        before -
                                        item.quantity;


                                    await client.query(

                                        `
                                        UPDATE products

                                        SET
                                            quantity = $1

                                        WHERE id = $2
                                        `,

                                        [

                                            after,

                                            item.product.id

                                        ]

                                    );


                                    // --------------------------
                                    // Stock movement
                                    // --------------------------

                                    await client.query(

                                        `
                                        INSERT INTO stock_movements
                                        (
                                            product_id,
                                            user_id,
                                            movement_type,
                                            quantity,
                                            quantity_before,
                                            quantity_after,
                                            reference,
                                            notes
                                        )

                                        VALUES
                                        (
                                            $1,
                                            $2,
                                            'sale',
                                            $3,
                                            $4,
                                            $5,
                                            $6,
                                            'Cash sale'
                                        )
                                        `,

                                        [

                                            item.product.id,

                                            req.user.id,

                                            -item.quantity,

                                            before,

                                            after,

                                            receiptNumber

                                        ]

                                    );

                                }


                                // --------------------------
                                // Payment
                                // --------------------------

                                await client.query(

                                    `
                                    INSERT INTO payments
                                    (
                                        sale_id,
                                        payment_method,
                                        amount,
                                        status,
                                        completed_at
                                    )

                                    VALUES
                                    (
                                        $1,
                                        'cash',
                                        $2,
                                        'completed',
                                        NOW()
                                    )
                                    `,

                                    [

                                        createdSale.id,

                                        totalAmount

                                    ]

                                );


                                // --------------------------
                                // Audit
                                // --------------------------

                                await client.query(

                                    `
                                    INSERT INTO audit_logs
                                    (
                                        user_id,
                                        action,
                                        entity_type,
                                        entity_id,
                                        description
                                    )

                                    VALUES
                                    (
                                        $1,
                                        'CREATE_SALE',
                                        'sale',
                                        $2,
                                        $3
                                    )
                                    `,

                                    [

                                        req.user.id,

                                        createdSale.id,

                                        `Cash sale ${receiptNumber} completed for KES ${totalAmount}`

                                    ]

                                );


                                return {

                                    sale:
                                        createdSale,

                                    change,

                                    items:
                                        saleItems.map(
                                            item => ({

                                                name:
                                                    item.product.name,

                                                quantity:
                                                    item.quantity,

                                                unit_price:
                                                    item.unitPrice,

                                                total:
                                                    item.totalPrice

                                            })
                                        )

                                };

                            }

                            catch (error) {

                                if (
                                    error.code ===
                                    "23505" &&
                                    !receiptCreated
                                ) {

                                    continue;

                                }

                                throw error;

                            }

                        }


                        throw new Error(
                            "RECEIPT_GENERATION_FAILED"
                        );

                    }
                );


            return res.status(201).json({

                success: true,

                message:
                    "Cash sale completed successfully.",

                receipt_number:
                    sale.sale.receipt_number,

                sale_id:
                    sale.sale.id,

                total:
                    Number(
                        sale.sale.total_amount
                    ),

                change:
                    sale.change,

                items:
                    sale.items

            });

        }

        catch (error) {

            console.error(
                "CASH SALE ERROR:",
                error
            );


            if (
                error.message ===
                "PRODUCT_NOT_FOUND"
            ) {

                return res.status(404).json({
                    success: false,
                    message: "One of the products no longer exists."
                });

            }


            if (
                error.message.startsWith(
                    "PRODUCT_INACTIVE:"
                )
            ) {

                return res.status(409).json({
                    success: false,
                    message:
                        `${error.message.split(":")[1]} is inactive.`
                });

            }


            if (
                error.message.startsWith(
                    "INSUFFICIENT_STOCK:"
                )
            ) {

                const parts =
                    error.message.split(":");

                return res.status(409).json({

                    success: false,

                    message:
                        `Insufficient stock for ${parts[1]}. Available: ${parts[2]}.`

                });

            }


            if (
                error.message ===
                "INSUFFICIENT_PAYMENT"
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Cash received is less than the sale total."

                });

            }


            return res.status(500).json({

                success: false,

                message:
                    "Unable to complete sale."

            });

        }

    }
);


// ======================================================
// GET SALE BY ID
// ======================================================

router.get(
    "/:id",
    authenticate,
    requireStaff,
    async (req, res) => {

        try {

            const saleId =
                Number(
                    req.params.id
                );


            if (
                !Number.isInteger(saleId)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid sale ID."

                });

            }


            const saleResult =
                await query(

                    `
                    SELECT
                        s.*,
                        u.username AS cashier_username,
                        u.full_name AS cashier_name

                    FROM sales s

                    LEFT JOIN users u
                        ON u.id = s.cashier_id

                    WHERE s.id = $1

                    LIMIT 1
                    `,

                    [
                        saleId
                    ]

                );


            if (
                saleResult.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Sale not found."

                });

            }


            const sale =
                saleResult.rows[0];


            /*
            ----------------------------------------------
            Cashiers can only view their own sales.
            Admins can view any sale.
            ----------------------------------------------
            */

            if (
                req.user.role === "cashier" &&
                Number(sale.cashier_id) !==
                Number(req.user.id)
            ) {

                return res.status(403).json({

                    success: false,

                    message:
                        "You cannot access this sale."

                });

            }


            const itemsResult =
                await query(

                    `
                    SELECT
                        id,
                        product_id,
                        barcode,
                        product_name,
                        quantity,
                        unit_price,
                        discount,
                        total_price

                    FROM sale_items

                    WHERE sale_id = $1

                    ORDER BY id ASC
                    `,

                    [
                        saleId
                    ]

                );


            const paymentResult =
                await query(

                    `
                    SELECT
                        id,
                        payment_method,
                        amount,
                        status,
                        phone_number,
                        mpesa_receipt_number,
                        transaction_reference,
                        created_at,
                        completed_at

                    FROM payments

                    WHERE sale_id = $1

                    ORDER BY id ASC
                    `,

                    [
                        saleId
                    ]

                );


            return res.json({

                success: true,

                sale: {

                    ...sale,

                    items:
                        itemsResult.rows,

                    payments:
                        paymentResult.rows

                }

            });

        }

        catch (error) {

            console.error(
                "GET SALE ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to load sale."

            });

        }

    }
);


// ======================================================
// CASHIER SALES HISTORY
// ======================================================

router.get(
    "/cashier/history",
    authenticate,
    requireStaff,
    async (req, res) => {

        try {

            const limit =
                Math.min(
                    Math.max(
                        Number(
                            req.query.limit || 50
                        ),
                        1
                    ),
                    100
                );


            const offset =
                Math.max(
                    Number(
                        req.query.offset || 0
                    ),
                    0
                );


            let result;


            if (
                req.user.role === "admin"
            ) {

                result =
                    await query(

                        `
                        SELECT
                            s.id,
                            s.receipt_number,
                            s.cashier_id,
                            u.username AS cashier_username,
                            u.full_name AS cashier_name,
                            s.total_amount,
                            s.status,
                            s.created_at

                        FROM sales s

                        LEFT JOIN users u
                            ON u.id = s.cashier_id

                        ORDER BY
                            s.created_at DESC

                        LIMIT $1
                        OFFSET $2
                        `,

                        [
                            limit,
                            offset
                        ]

                    );

            }

            else {

                result =
                    await query(

                        `
                        SELECT
                            s.id,
                            s.receipt_number,
                            s.cashier_id,
                            u.username AS cashier_username,
                            u.full_name AS cashier_name,
                            s.total_amount,
                            s.status,
                            s.created_at

                        FROM sales s

                        LEFT JOIN users u
                            ON u.id = s.cashier_id

                        WHERE
                            s.cashier_id = $1

                        ORDER BY
                            s.created_at DESC

                        LIMIT $2
                        OFFSET $3
                        `,

                        [
                            req.user.id,
                            limit,
                            offset
                        ]

                    );

            }


            return res.json({

                success: true,

                sales:
                    result.rows

            });

        }

        catch (error) {

            console.error(
                "SALES HISTORY ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to load sales history."

            });

        }

    }
);


module.exports = router;

Add it to "server/server.js"

After your other routes:

const salesRoutes =
    require("./salesRoutes");

app.use(
    "/api/sales",
    salesRoutes
);

Your cashier's existing call:

POS_API.post("/sales", {
    items: cart.map(item => ({
        product_id: item.id,
        barcode: item.barcode,
        quantity: item.quantity
    })),
    payment_method: "cash",
    amount_received: cash
});

will now reach this route.

What happens when a cashier sells an item

Scan barcode
     ↓
Find product
     ↓
Add to cart
     ↓
Cashier clicks CASH
     ↓
Server locks product
     ↓
Checks stock
     ↓
Creates receipt
     ↓
Records sale
     ↓
Records sale items
     ↓
Deducts stock
     ↓
Records stock movement
     ↓
Records payment
     ↓
Creates audit log
     ↓
Returns receipt + change

The transaction is wrapped in PostgreSQL "BEGIN/COMMIT", so if something fails halfway through, the sale and stock changes are rolled back together.

Next file: "server/dashboardRoutes.js" — this will connect the Admin dashboard to real-time totals, today's sales, active cashiers/admins, stock information, and sales summaries.
