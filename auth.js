"use strict";

const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const {
    query
} = require("./database");


const router =
    express.Router();


// ======================================================
// CONFIGURATION
// ======================================================

const JWT_SECRET =
    process.env.JWT_SECRET;

const SESSION_HOURS =
    Number(
        process.env.SESSION_HOURS || 12
    );

const MAX_ADMINS =
    2;

const MAX_CASHIERS =
    15;


if (!JWT_SECRET) {

    console.error(
        "WARNING: JWT_SECRET is not configured."
    );

}


// ======================================================
// HELPERS
// ======================================================

function hashToken(token) {

    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

}


function createToken(user) {

    if (!JWT_SECRET) {

        throw new Error(
            "JWT_SECRET is not configured."
        );

    }


    return jwt.sign(

        {
            sub:
                String(user.id),

            role:
                user.role,

            username:
                user.username

        },

        JWT_SECRET,

        {
            expiresIn:
                `${SESSION_HOURS}h`
        }

    );

}


function getClientIP(req) {

    const forwarded =
        req.headers["x-forwarded-for"];

    if (forwarded) {

        return String(
            forwarded
        )
        .split(",")[0]
        .trim();

    }

    return (
        req.socket?.remoteAddress ||
        null
    );

}


// ======================================================
// AUTHENTICATION MIDDLEWARE
// ======================================================

async function authenticate(
    req,
    res,
    next
) {

    try {

        const header =
            req.headers.authorization;


        if (
            !header ||
            !header.startsWith(
                "Bearer "
            )
        ) {

            return res.status(401).json({

                success: false,

                message:
                    "Authentication required."

            });

        }


        const token =
            header.substring(7);


        let decoded;


        try {

            decoded =
                jwt.verify(
                    token,
                    JWT_SECRET
                );

        }

        catch (error) {

            return res.status(401).json({

                success: false,

                message:
                    "Invalid or expired login session."

            });

        }


        const tokenHash =
            hashToken(token);


        const result =
            await query(

                `
                SELECT
                    u.id,
                    u.username,
                    u.full_name,
                    u.role,
                    u.is_active,
                    s.expires_at

                FROM user_sessions s

                INNER JOIN users u
                    ON u.id = s.user_id

                WHERE
                    s.token_hash = $1

                    AND
                    s.expires_at > NOW()

                    AND
                    u.is_active = TRUE

                LIMIT 1
                `,

                [
                    tokenHash
                ]

            );


        if (
            result.rows.length === 0
        ) {

            return res.status(401).json({

                success: false,

                message:
                    "Login session is no longer active."

            });

        }


        const user =
            result.rows[0];


        /*
        ----------------------------------------------
        Update activity time
        ----------------------------------------------
        */

        await query(

            `
            UPDATE user_sessions

            SET last_activity = NOW()

            WHERE token_hash = $1
            `,

            [
                tokenHash
            ]

        );


        req.user = {

            id:
                user.id,

            username:
                user.username,

            name:
                user.full_name,

            role:
                user.role

        };


        req.authToken =
            token;


        next();

    }

    catch (error) {

        console.error(
            "Authentication error:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Authentication service error."

        });

    }

}


// ======================================================
// LOGIN
// ======================================================

router.post(
    "/login",
    async (req, res) => {

        try {

            const username =
                String(
                    req.body.username || ""
                )
                .trim();


            const password =
                String(
                    req.body.password || ""
                );


            if (
                !username ||
                !password
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Username and password are required."

                });

            }


            /*
            ------------------------------------------------
            Find user
            ------------------------------------------------
            */

            const userResult =
                await query(

                    `
                    SELECT
                        id,
                        username,
                        full_name,
                        password_hash,
                        role,
                        is_active

                    FROM users

                    WHERE
                        LOWER(username)
                        =
                        LOWER($1)

                    LIMIT 1
                    `,

                    [
                        username
                    ]

                );


            if (
                userResult.rows.length === 0
            ) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Invalid username or password."

                });

            }


            const user =
                userResult.rows[0];


            /*
            ------------------------------------------------
            Account active?
            ------------------------------------------------
            */

            if (
                !user.is_active
            ) {

                return res.status(403).json({

                    success: false,

                    message:
                        "This account has been disabled."

                });

            }


            /*
            ------------------------------------------------
            Verify password
            ------------------------------------------------
            */

            const passwordCorrect =
                await bcrypt.compare(
                    password,
                    user.password_hash
                );


            if (!passwordCorrect) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Invalid username or password."

                });

            }


            /*
            ------------------------------------------------
            Clean expired sessions first
            ------------------------------------------------
            */

            await query(
                `
                DELETE FROM user_sessions

                WHERE
                    expires_at < NOW()
                `
            );


            /*
            ------------------------------------------------
            Count active sessions
            ------------------------------------------------
            */

            const sessionCountResult =
                await query(

                    `
                    SELECT
                        COUNT(*)::INTEGER
                        AS count

                    FROM user_sessions s

                    INNER JOIN users u
                        ON u.id = s.user_id

                    WHERE
                        u.role = $1

                        AND
                        u.is_active = TRUE

                        AND
                        s.expires_at > NOW()
                    `,

                    [
                        user.role
                    ]

                );


            const activeSessions =
                sessionCountResult
                    .rows[0]
                    .count;


            const maximum =
                user.role === "admin"
                    ? MAX_ADMINS
                    : MAX_CASHIERS;


            /*
            ------------------------------------------------
            Enforce concurrent login limit
            ------------------------------------------------
            */

            if (
                activeSessions >= maximum
            ) {

                return res.status(429).json({

                    success: false,

                    message:
                        user.role === "admin"
                            ? "Maximum of 2 admin accounts are currently logged in."
                            : "Maximum of 15 cashiers are currently logged in."

                });

            }


            /*
            ------------------------------------------------
            Create JWT
            ------------------------------------------------
            */

            const token =
                createToken(
                    user
                );


            const tokenHash =
                hashToken(
                    token
                );


            const expiresAt =
                new Date(
                    Date.now() +
                    (
                        SESSION_HOURS *
                        60 *
                        60 *
                        1000
                    )
                );


            /*
            ------------------------------------------------
            Save session
            ------------------------------------------------
            */

            await query(

                `
                INSERT INTO user_sessions
                (
                    user_id,
                    token_hash,
                    expires_at,
                    ip_address,
                    user_agent
                )

                VALUES
                (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5
                )
                `,

                [

                    user.id,

                    tokenHash,

                    expiresAt,

                    getClientIP(req),

                    req.headers[
                        "user-agent"
                    ] || null

                ]

            );


            /*
            ------------------------------------------------
            Audit login
            ------------------------------------------------
            */

            await query(

                `
                INSERT INTO audit_logs
                (
                    user_id,
                    action,
                    entity_type,
                    entity_id,
                    description,
                    ip_address
                )

                VALUES
                (
                    $1,
                    'LOGIN',
                    'user',
                    $1,
                    $2,
                    $3
                )
                `,

                [

                    user.id,

                    `${user.role} logged in`,

                    getClientIP(req)

                ]

            );


            /*
            ------------------------------------------------
            Return user
            ------------------------------------------------
            */

            return res.status(200).json({

                success: true,

                message:
                    "Login successful.",

                token,

                user: {

                    id:
                        user.id,

                    username:
                        user.username,

                    name:
                        user.full_name,

                    role:
                        user.role

                }

            });

        }

        catch (error) {

            console.error(
                "LOGIN ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to process login."

            });

        }

    }
);


// ======================================================
// CURRENT USER
// ======================================================

router.get(
    "/me",
    authenticate,
    async (req, res) => {

        return res.status(200).json({

            success: true,

            user:
                req.user

        });

    }
);


// ======================================================
// LOGOUT
// ======================================================

router.post(
    "/logout",
    authenticate,
    async (req, res) => {

        try {

            const tokenHash =
                hashToken(
                    req.authToken
                );


            await query(

                `
                DELETE FROM user_sessions

                WHERE
                    token_hash = $1
                `,

                [
                    tokenHash
                ]

            );


            await query(

                `
                INSERT INTO audit_logs
                (
                    user_id,
                    action,
                    entity_type,
                    entity_id,
                    description,
                    ip_address
                )

                VALUES
                (
                    $1,
                    'LOGOUT',
                    'user',
                    $1,
                    $2,
                    $3
                )
                `,

                [

                    req.user.id,

                    `${req.user.role} logged out`,

                    getClientIP(req)

                ]

            );


            return res.status(200).json({

                success: true,

                message:
                    "Logged out successfully."

            });

        }

        catch (error) {

            console.error(
                "LOGOUT ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to logout."

            });

        }

    }
);


// ======================================================
// EXPORT
// ======================================================

module.exports = {

    router,

    authenticate,

    MAX_ADMINS,

    MAX_CASHIERS

};
