"use strict";

/*
========================================================
GENERALI POS - ADMIN CONTROLLER
========================================================
*/


document.addEventListener(
    "DOMContentLoaded",
    async () => {

        /*
        =================================================
        1. CHECK ADMIN LOGIN
        =================================================
        */

        const user =
            await POS_API.requireLogin(
                "admin"
            );


        if (!user) {
            return;
        }


        /*
        =================================================
        2. DISPLAY ADMIN INFORMATION
        =================================================
        */

        setText(
            "adminName",
            user.name ||
            user.username
        );


        setText(
            "adminUsername",
            user.username
        );


        setText(
            "adminRole",
            "Administrator"
        );


        /*
        =================================================
        3. LOGOUT
        =================================================
        */

        const logoutButton =
            document.getElementById(
                "logoutButton"
            );


        if (logoutButton) {

            logoutButton.addEventListener(
                "click",
                async () => {

                    const confirmed =
                        confirm(
                            "Are you sure you want to logout?"
                        );


                    if (!confirmed) {
                        return;
                    }


                    logoutButton.disabled =
                        true;

                    logoutButton.textContent =
                        "Logging out...";


                    await POS_API.logoutUser();


                    window.location.replace(
                        "/index.html"
                    );

                }
            );

        }


        /*
        =================================================
        4. BACK TO HOME
        =================================================
        */

        const backButton =
            document.getElementById(
                "backHomeButton"
            );


        if (backButton) {

            backButton.addEventListener(
                "click",
                event => {

                    event.preventDefault();


                    window.location.href =
                        "/index.html";

                }
            );

        }


        /*
        =================================================
        5. DASHBOARD BUTTON
        =================================================
        */

        const dashboardButton =
            document.getElementById(
                "dashboardButton"
            );


        if (dashboardButton) {

            dashboardButton.addEventListener(
                "click",
                () => {

                    window.location.href =
                        "/dashboard.html";

                }
            );

        }


        /*
        =================================================
        6. LOAD ADMIN SUMMARY
        =================================================
        */

        await loadAdminSummary();


        /*
        =================================================
        7. LOAD ACTIVE USERS
        =================================================
        */

        await loadActiveUsers();

    }
);


// ======================================================
// TEXT HELPER
// ======================================================

function setText(
    id,
    value
) {

    const element =
        document.getElementById(
            id
        );


    if (element) {

        element.textContent =
            value ??
            "";

    }

}


// ======================================================
// ADMIN SUMMARY
// ======================================================

async function loadAdminSummary() {

    try {

        const result =
            await POS_API.get(
                "/dashboard/admin-summary"
            );


        if (
            !result ||
            !result.success
        ) {

            return;

        }


        const summary =
            result.summary ||
            {};


        setText(
            "totalProducts",
            summary.totalProducts ??
            0
        );


        setText(
            "totalStock",
            summary.totalStock ??
            0
        );


        setText(
            "todaySales",
            formatMoney(
                summary.todaySales ??
                0
            )
        );


        setText(
            "todayTransactions",
            summary.todayTransactions ??
            0
        );


        setText(
            "activeCashiers",
            summary.activeCashiers ??
            0
        );


        setText(
            "activeAdmins",
            summary.activeAdmins ??
            0
        );

    }

    catch (error) {

        console.error(
            "Unable to load admin summary:",
            error
        );

    }

}


// ======================================================
// ACTIVE USERS
// ======================================================

async function loadActiveUsers() {

    try {

        const result =
            await POS_API.get(
                "/dashboard/active-users"
            );


        if (
            !result ||
            !result.success
        ) {

            return;

        }


        const active =
            result.active ||
            {};


        setText(
            "activeAdmins",
            active.admins ??
            0
        );


        setText(
            "activeCashiers",
            active.cashiers ??
            0
        );

    }

    catch (error) {

        console.error(
            "Unable to load active users:",
            error
        );

    }

}


// ======================================================
// MONEY FORMAT
// ======================================================

function formatMoney(
    amount
) {

    const value =
        Number(amount) || 0;


    return "KES " +
        value.toLocaleString(
            "en-KE",
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }
        );

}


// ======================================================
// GLOBAL LOGOUT HELPER
// ======================================================

window.generaliLogout =
    async function () {

        await POS_API.logoutUser();


        window.location.replace(
            "/index.html"
        );

    };
