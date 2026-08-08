"use strict";

const express = require("express");

const {
    query,
    transaction
} = require("./database");

const {
    authenticate
} = require("./auth");


const router =
    express.Router();


// ======================================================
// ADMIN ONLY MIDDLEWARE
// ======================================================

function requireAdmin(
    req,
    res,
    next
) {

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
// CASHIER OR ADMIN
// ======================================================

function requireStaff(
    req,
    res,
    next
) {

    if (
        !req.user ||
        ![
            "admin",
            "cashier"
        ].includes(
            req.user.role
        )
    ) {

        return res.status(403).json({

            success: false,

            message:
                "Staff access required."

        });

    }


    next();

}


// ======================================================
// GET PRODUCT BY BARCODE
// ======================================================

router.get(
    "/barcode/:barcode",
    authenticate,
    requireStaff,
    async (req, res) => {

        try {

            const barcode =
                String(
                    req.params.barcode || ""
                ).trim();


            if (!barcode) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Barcode is required."

                });

            }


            const result =
                await query(

                    `
                    SELECT
                        id,
                        barcode,
                        name,
                        description,
                        selling_price,
                        quantity,
                        minimum_stock,
                        category,
                        unit,
                        is_active

                    FROM products

                    WHERE
                        barcode = $1

                        AND
                        is_active = TRUE

                    LIMIT 1
                    `,

                    [
                        barcode
                    ]

                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Product not found."

                });

            }


            const product =
                result.rows[0];


            if (
                Number(product.quantity) <= 0
            ) {

                return res.status(409).json({

                    success: false,

                    message:
                        "This product is out of stock."

                });

            }


            return res.json({

                success: true,

                product

            });

        }

        catch (error) {

            console.error(
                "BARCODE LOOKUP ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to search for product."

            });

        }

    }
);


// ======================================================
// SEARCH PRODUCTS
// ======================================================

router.get(
    "/search",
    authenticate,
    requireStaff,
    async (req, res) => {

        try {

            const search =
                String(
                    req.query.q || ""
                ).trim();


            if (
                search.length < 1
            ) {

                return res.json({

                    success: true,

                    products: []

                });

            }


            const result =
                await query(

                    `
                    SELECT
                        id,
                        barcode,
                        name,
                        selling_price,
                        quantity,
                        category,
                        unit

                    FROM products

                    WHERE
                        is_active = TRUE

                        AND
                        (
                            barcode ILIKE $1
                            OR
                            name ILIKE $1
                        )

                    ORDER BY name ASC

                    LIMIT 30
                    `,

                    [
                        `%${search}%`
                    ]

                );


            return res.json({

                success: true,

                products:
                    result.rows

            });

        }

        catch (error) {

            console.error(
                "PRODUCT SEARCH ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to search products."

            });

        }

    }
);


// ======================================================
// GET ALL PRODUCTS - ADMIN
// ======================================================

router.get(
    "/",
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
                        description,
                        buying_price,
                        selling_price,
                        quantity,
                        minimum_stock,
                        category,
                        unit,
                        is_active,
                        created_at,
                        updated_at

                    FROM products

                    ORDER BY
                        created_at DESC
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
                "GET PRODUCTS ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to load products."

            });

        }

    }
);


// ======================================================
// CREATE PRODUCT - ADMIN
// ======================================================

router.post(
    "/",
    authenticate,
    requireAdmin,
    async (req, res) => {

        try {

            const {

                barcode,
                name,
                description,
                buying_price,
                selling_price,
                quantity,
                minimum_stock,
                category,
                unit

            } = req.body;


            /*
            ------------------------------------------------
            Validate
            ------------------------------------------------
            */

            if (
                !barcode ||
                !name
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Barcode and product name are required."

                });

            }


            const buyPrice =
                Number(
                    buying_price || 0
                );


            const sellPrice =
                Number(
                    selling_price || 0
                );


            const stock =
                Number(
                    quantity || 0
                );


            const minimumStock =
                Number(
                    minimum_stock || 5
                );


            if (
                buyPrice < 0 ||
                sellPrice < 0 ||
                stock < 0 ||
                minimumStock < 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Product values cannot be negative."

                });

            }


            /*
            ------------------------------------------------
            Create product + stock record
            ------------------------------------------------
            */

            const product =
                await transaction(
                    async client => {

                        const productResult =
                            await client.query(

                                `
                                INSERT INTO products
                                (
                                    barcode,
                                    name,
                                    description,
                                    buying_price,
                                    selling_price,
                                    quantity,
                                    minimum_stock,
                                    category,
                                    unit,
                                    created_by
                                )

                                VALUES
                                (
                                    $1,
                                    $2,
                                    $3,
                                    $4,
                                    $5,
                                    $6,
                                    $7,
                                    $8,
                                    $9,
                                    $10
                                )

                                RETURNING *
                                `,

                                [

                                    String(
                                        barcode
                                    ).trim(),

                                    String(
                                        name
                                    ).trim(),

                                    description ||
                                        null,

                                    buyPrice,

                                    sellPrice,

                                    stock,

                                    minimumStock,

                                    category ||
                                        null,

                                    unit ||
                                        "piece",

                                    req.user.id

                                ]

                            );


                        const created =
                            productResult
                                .rows[0];


                        if (
                            stock > 0
                        ) {

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
                                    'opening',
                                    $3,
                                    0,
                                    $3,
                                    'PRODUCT_CREATION',
                                    'Opening stock'
                                )
                                `,

                                [

                                    created.id,

                                    req.user.id,

                                    stock

                                ]

                            );

                        }


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
                                'CREATE_PRODUCT',
                                'product',
                                $2,
                                $3
                            )
                            `,

                            [

                                req.user.id,

                                created.id,

                                `Created product ${created.name}`

                            ]

                        );


                        return created;

                    }

                );


            return res.status(201).json({

                success: true,

                message:
                    "Product created successfully.",

                product

            });

        }

        catch (error) {

            console.error(
                "CREATE PRODUCT ERROR:",
                error
            );


            if (
                error.code ===
                "23505"
            ) {

                return res.status(409).json({

                    success: false,

                    message:
                        "A product with this barcode already exists."

                });

            }


            return res.status(500).json({

                success: false,

                message:
                    "Unable to create product."

            });

        }

    }
);


// ======================================================
// UPDATE PRODUCT - ADMIN
// ======================================================

router.put(
    "/:id",
    authenticate,
    requireAdmin,
    async (req, res) => {

        try {

            const id =
                Number(
                    req.params.id
                );


            if (
                !Number.isInteger(id)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid product ID."

                });

            }


            const {

                barcode,
                name,
                description,
                buying_price,
                selling_price,
                minimum_stock,
                category,
                unit,
                is_active

            } = req.body;


            const result =
                await query(

                    `
                    UPDATE products

                    SET

                        barcode =
                            COALESCE(
                                $1,
                                barcode
                            ),

                        name =
                            COALESCE(
                                $2,
                                name
                            ),

                        description =
                            COALESCE(
                                $3,
                                description
                            ),

                        buying_price =
                            COALESCE(
                                $4,
                                buying_price
                            ),

                        selling_price =
                            COALESCE(
                                $5,
                                selling_price
                            ),

                        minimum_stock =
                            COALESCE(
                                $6,
                                minimum_stock
                            ),

                        category =
                            COALESCE(
                                $7,
                                category
                            ),

                        unit =
                            COALESCE(
                                $8,
                                unit
                            ),

                        is_active =
                            COALESCE(
                                $9,
                                is_active
                            )

                    WHERE id = $10

                    RETURNING *
                    `,

                    [

                        barcode ||
                            null,

                        name ||
                            null,

                        description ??
                            null,

                        buying_price !==
                        undefined
                            ? Number(
                                buying_price
                            )
                            : null,

                        selling_price !==
                        undefined
                            ? Number(
                                selling_price
                            )
                            : null,

                        minimum_stock !==
                        undefined
                            ? Number(
                                minimum_stock
                            )
                            : null,

                        category ??
                            null,

                        unit ??
                            null,

                        is_active !==
                        undefined
                            ? Boolean(
                                is_active
                            )
                            : null,

                        id

                    ]

                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Product not found."

                });

            }


            return res.json({

                success: true,

                message:
                    "Product updated successfully.",

                product:
                    result.rows[0]

            });

        }

        catch (error) {

            console.error(
                "UPDATE PRODUCT ERROR:",
                error
            );


            if (
                error.code ===
                "23505"
            ) {

                return res.status(409).json({

                    success: false,

                    message:
                        "Barcode already belongs to another product."

                });

            }


            return res.status(500).json({

                success: false,

                message:
                    "Unable to update product."

            });

        }

    }
);


// ======================================================
// STOCK ADJUSTMENT - ADMIN
// ======================================================

router.post(
    "/:id/stock",
    authenticate,
    requireAdmin,
    async (req, res) => {

        try {

            const productId =
                Number(
                    req.params.id
                );


            const quantityChange =
                Number(
                    req.body.quantity
                );


            const movementType =
                String(
                    req.body.movement_type ||
                    "adjustment"
                );


            const notes =
                req.body.notes ||
                null;


            if (
                !Number.isInteger(
                    productId
                )
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid product ID."

                });

            }


            if (
                !Number.isInteger(
                    quantityChange
                ) ||
                quantityChange === 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Stock change must be a non-zero whole number."

                });

            }


            const allowedTypes = [

                "purchase",
                "return",
                "adjustment",
                "damage"

            ];


            if (
                !allowedTypes.includes(
                    movementType
                )
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid stock movement type."

                });

            }


            const updated =
                await transaction(
                    async client => {

                        const productResult =
                            await client.query(

                                `
                                SELECT
                                    id,
                                    name,
                                    quantity

                                FROM products

                                WHERE id = $1

                                FOR UPDATE
                                `,

                                [
                                    productId
                                ]

                            );


                        if (
                            productResult.rows.length ===
                            0
                        ) {

                            throw new Error(
                                "PRODUCT_NOT_FOUND"
                            );

                        }


                        const product =
                            productResult
                                .rows[0];


                        const before =
                            Number(
                                product.quantity
                            );


                        const after =
                            before +
                            quantityChange;


                        if (
                            after < 0
                        ) {

                            throw new Error(
                                "INSUFFICIENT_STOCK"
                            );

                        }


                        await client.query(

                            `
                            UPDATE products

                            SET quantity = $1

                            WHERE id = $2
                            `,

                            [

                                after,

                                productId

                            ]

                        );


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
                                notes
                            )

                            VALUES
                            (
                                $1,
                                $2,
                                $3,
                                $4,
                                $5,
                                $6,
                                $7
                            )
                            `,

                            [

                                productId,

                                req.user.id,

                                movementType,

                                quantityChange,

                                before,

                                after,

                                notes

                            ]

                        );


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
                                'STOCK_ADJUSTMENT',
                                'product',
                                $2,
                                $3
                            )
                            `,

                            [

                                req.user.id,

                                productId,

                                `${product.name}: ${before} -> ${after}`

                            ]

                        );


                        return {

                            productId,

                            before,

                            after

                        };

                    }
                );


            return res.json({

                success: true,

                message:
                    "Stock updated successfully.",

                stock:
                    updated

            });

        }

        catch (error) {

            console.error(
                "STOCK UPDATE ERROR:",
                error
            );


            if (
                error.message ===
                "PRODUCT_NOT_FOUND"
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Product not found."

                });

            }


            if (
                error.message ===
                "INSUFFICIENT_STOCK"
            ) {

                return res.status(409).json({

                    success: false,

                    message:
                        "Stock cannot become negative."

                });

            }


            return res.status(500).json({

                success: false,

                message:
                    "Unable to update stock."

            });

        }

    }
);


// ======================================================
// DELETE / DEACTIVATE PRODUCT
// ======================================================

router.delete(
    "/:id",
    authenticate,
    requireAdmin,
    async (req, res) => {

        try {

            const id =
                Number(
                    req.params.id
                );


            if (
                !Number.isInteger(id)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid product ID."

                });

            }


            const result =
                await query(

                    `
                    UPDATE products

                    SET
                        is_active = FALSE

                    WHERE id = $1

                    RETURNING
                        id,
                        name,
                        barcode
                    `,

                    [
                        id
                    ]

                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Product not found."

                });

            }


            await query(

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
                    'DEACTIVATE_PRODUCT',
                    'product',
                    $2,
                    $3
                )
                `,

                [

                    req.user.id,

                    id,

                    `Deactivated product ${result.rows[0].name}`

                ]

            );


            return res.json({

                success: true,

                message:
                    "Product deactivated successfully."

            });

        }

        catch (error) {

            console.error(
                "DELETE PRODUCT ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to deactivate product."

            });

        }

    }
);


module.exports =
    router;
