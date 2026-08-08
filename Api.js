"use strict";

/*
========================================================
GENERALI POS - API CLIENT
========================================================

This file handles communication between the frontend
and the Node.js backend.

Authentication token is stored in localStorage.

========================================================
*/


const POS_API = (() => {


    // ==================================================
    // CONFIGURATION
    // ==================================================

    const TOKEN_KEY =
        "generali_pos_token";

    const USER_KEY =
        "generali_pos_user";


    /*
    ----------------------------------------------------
    API URL

    Empty string means:
        https://your-live-domain.com/api

    This is important for deployment because the
    frontend and backend are served from the same
    domain.
    ----------------------------------------------------
    */

    const API_BASE =
        "/api";


    // ==================================================
    // TOKEN FUNCTIONS
    // ==================================================

    function getToken() {

        return localStorage.getItem(
            TOKEN_KEY
        );

    }


    function saveToken(token) {

        if (!token) {
            return;
        }

        localStorage.setItem(
            TOKEN_KEY,
            token
        );

    }


    function removeToken() {

        localStorage.removeItem(
            TOKEN_KEY
        );

    }


    // ==================================================
    // USER FUNCTIONS
    // ==================================================

    function getUser() {

        const data =
            localStorage.getItem(
                USER_KEY
            );


        if (!data) {

            return null;

        }


        try {

            return JSON.parse(
                data
            );

        }

        catch (error) {

            console.error(
                "Invalid stored user:",
                error
            );

            localStorage.removeItem(
                USER_KEY
            );

            return null;

        }

    }


    function saveUser(user) {

        if (!user) {
            return;
        }


        localStorage.setItem(
            USER_KEY,
            JSON.stringify(user)
        );

    }


    function removeUser() {

        localStorage.removeItem(
            USER_KEY
        );

    }


    // ==================================================
    // CLEAR LOGIN
    // ==================================================

    function clearLogin() {

        removeToken();

        removeUser();

    }


    // ==================================================
    // REQUEST HELPER
    // ==================================================

    async function request(
        endpoint,
        options = {}
    ) {

        const token =
            getToken();


        const headers = {

            "Content-Type":
                "application/json",

            ...(options.headers || {})

        };


        /*
        ------------------------------------------------
        Add authentication token
        ------------------------------------------------
        */

        if (token) {

            headers[
                "Authorization"
            ] =
                `Bearer ${token}`;

        }


        const response =
            await fetch(

                `${API_BASE}${endpoint}`,

                {

                    ...options,

                    headers

                }

            );


        /*
        ------------------------------------------------
        Read response
        ------------------------------------------------
        */

        let data = null;


        try {

            data =
                await response.json();

        }

        catch (error) {

            data = null;

        }


        /*
        ------------------------------------------------
        Authentication failed
        ------------------------------------------------
        */

        if (
            response.status === 401
        ) {

            clearLogin();

            /*
            Don't automatically redirect here.
            The individual page decides what to do.
            */

        }


        /*
        ------------------------------------------------
        API error
        ------------------------------------------------
        */

        if (!response.ok) {

            const error =
                new Error(

                    data?.message ||
                    `Request failed (${response.status})`

                );


            error.status =
                response.status;


            error.data =
                data;


            throw error;

        }


        return data;

    }


    // ==================================================
    // LOGIN
    // ==================================================

    async function loginUser(
        username,
        password
    ) {

        const result =
            await request(

                "/auth/login",

                {

                    method:
                        "POST",

                    body:
                        JSON.stringify({

                            username,

                            password

                        })

                }

            );


        /*
        ------------------------------------------------
        Save authentication information
        ------------------------------------------------
        */

        if (
            result &&
            result.success &&
            result.token &&
            result.user
        ) {

            saveToken(
                result.token
            );

            saveUser(
                result.user
            );

        }


        return result;

    }


    // ==================================================
    // GET CURRENT USER
    // ==================================================

    async function getCurrentUser() {

        const token =
            getToken();


        if (!token) {

            return null;

        }


        try {

            const result =
                await request(
                    "/auth/me"
                );


            if (
                result &&
                result.success &&
                result.user
            ) {

                saveUser(
                    result.user
                );

                return result.user;

            }


            return null;

        }

        catch (error) {

            if (
                error.status === 401
            ) {

                clearLogin();

                return null;

            }


            throw error;

        }

    }


    // ==================================================
    // LOGOUT
    // ==================================================

    async function logoutUser() {

        try {

            if (
                getToken()
            ) {

                await request(

                    "/auth/logout",

                    {

                        method:
                            "POST"

                    }

                );

            }

        }

        catch (error) {

            console.error(
                "Logout request failed:",
                error
            );

        }

        finally {

            clearLogin();

        }

    }


    // ==================================================
    // AUTH CHECK
    // ==================================================

    async function requireLogin(
        requiredRole = null
    ) {

        const token =
            getToken();


        if (!token) {

            window.location.replace(
                "/login.html"
            );

            return null;

        }


        try {

            const user =
                await getCurrentUser();


            if (!user) {

                window.location.replace(
                    "/login.html"
                );

                return null;

            }


            /*
            --------------------------------------------
            Check role
            --------------------------------------------
            */

            if (
                requiredRole &&
                user.role !== requiredRole
            ) {

                alert(
                    "You are not authorized to access this page."
                );


                window.location.replace(
                    "/index.html"
                );


                return null;

            }


            return user;

        }

        catch (error) {

            console.error(
                "Authentication check failed:",
                error
            );


            clearLogin();


            window.location.replace(
                "/login.html"
            );


            return null;

        }

    }


    // ==================================================
    // GENERIC GET
    // ==================================================

    async function get(
        endpoint
    ) {

        return request(
            endpoint,
            {
                method: "GET"
            }
        );

    }


    // ==================================================
    // GENERIC POST
    // ==================================================

    async function post(
        endpoint,
        body = {}
    ) {

        return request(

            endpoint,

            {

                method:
                    "POST",

                body:
                    JSON.stringify(
                        body
                    )

            }

        );

    }


    // ==================================================
    // GENERIC PUT
    // ==================================================

    async function put(
        endpoint,
        body = {}
    ) {

        return request(

            endpoint,

            {

                method:
                    "PUT",

                body:
                    JSON.stringify(
                        body
                    )

            }

        );

    }


    // ==================================================
    // GENERIC DELETE
    // ==================================================

    async function remove(
        endpoint
    ) {

        return request(

            endpoint,

            {

                method:
                    "DELETE"

            }

        );

    }


    // ==================================================
    // PUBLIC API
    // ==================================================

    return {

        getToken,

        saveToken,

        removeToken,

        getUser,

        saveUser,

        removeUser,

        clearLogin,

        request,

        loginUser,

        getCurrentUser,

        logoutUser,

        requireLogin,

        get,

        post,

        put,

        delete: remove

    };


})();
