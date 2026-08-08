"use strict";

require("dotenv").config();

const bcrypt = require("bcrypt");
const readline = require("readline");

const {
    query,
    closeDatabase
} = require("./database");


// ==========================================
// READ INPUT
// ==========================================

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});


function ask(question) {

    return new Promise(resolve => {

        rl.question(
            question,
            answer => resolve(
                answer.trim()
            )
        );

    });

}


// ==========================================
// CREATE ADMIN
// ==========================================

async function createAdmin() {

    console.log("");
    console.log("======================================");
    console.log("       GENERALI POS ADMIN SETUP");
    console.log("======================================");
    console.log("");


    try {

        const username =
            await ask(
                "Admin username: "
            );


        const fullName =
            await ask(
                "Admin full name: "
            );


        const password =
            await ask(
                "Admin password: "
            );


        if (
            !username ||
            !fullName ||
            !password
        ) {

            throw new Error(
                "All fields are required."
            );

        }


        if (
            password.length < 8
        ) {

            throw new Error(
                "Password must contain at least 8 characters."
            );

        }


        /*
        ------------------------------------------
        Check username
        ------------------------------------------
        */

        const existing =
            await query(

                `
                SELECT id
                FROM users
                WHERE LOWER(username) = LOWER($1)
                LIMIT 1
                `,

                [
                    username
                ]

            );


        if (
            existing.rows.length > 0
        ) {

            throw new Error(
                "That username already exists."
            );

        }


        /*
        ------------------------------------------
        Hash password
        ------------------------------------------
        */

        const passwordHash =
            await bcrypt.hash(
                password,
                12
            );


        /*
        ------------------------------------------
        Create admin
        ------------------------------------------
        */

        const result =
            await query(

                `
                INSERT INTO users
                (
                    username,
                    full_name,
                    password_hash,
                    role,
                    is_active
                )

                VALUES
                (
                    $1,
                    $2,
                    $3,
                    'admin',
                    TRUE
                )

                RETURNING
                    id,
                    username,
                    full_name,
                    role,
                    is_active,
                    created_at
                `,

                [

                    username,

                    fullName,

                    passwordHash

                ]

            );


        const admin =
            result.rows[0];


        /*
        ------------------------------------------
        Audit log
        ------------------------------------------
        */

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
                'CREATE_ADMIN',
                'user',
                $1,
                'Initial administrator account created'
            )
            `,

            [
                admin.id
            ]

        );


        console.log("");
        console.log(
            "Admin account created successfully."
        );

        console.log("");

        console.log(
            "Username:",
            admin.username
        );

        console.log(
            "Name:",
            admin.full_name
        );

        console.log(
            "Role:",
            admin.role
        );

        console.log("");

        console.log(
            "You can now log in through:"
        );

        console.log(
            "/login.html?role=admin"
        );

        console.log("");


    }

    catch (error) {

        console.error("");
        console.error(
            "ADMIN SETUP ERROR:"
        );

        console.error(
            error.message
        );

        console.error("");

        process.exitCode = 1;

    }

    finally {

        rl.close();

        await closeDatabase();

    }

}


// ==========================================
// START
// ==========================================

createAdmin();
