"use strict";

/*
========================================================
GENERALI POS - CASHIER CONTROLLER
========================================================

Responsibilities:
- Verify cashier authentication
- Display cashier identity
- Protect cashier page
- Handle logout
- Handle back-to-home
- Search products by barcode
- Add products to cart
- Calculate totals
- Submit sales
========================================================
*/


let currentCashier = null;

let cart = [];


// ======================================================
// START CASHIER PAGE
// ======================================================

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        /*
        --------------------------------------------------
        Verify cashier
        --------------------------------------------------
        */

        currentCashier =
            await POS_API.requireLogin(
                "cashier"
            );


        if (!currentCashier) {
            return;
        }


        /*
        --------------------------------------------------
        Display cashier information
        --------------------------------------------------
        */

        setText(
            "cashierName",
            currentCashier.name ||
            currentCashier.username
        );


        setText(
            "cashierUsername",
            currentCashier.username
        );


        setText(
            "cashierRole",
            "Cashier"
        );


        /*
        --------------------------------------------------
        Setup buttons
        --------------------------------------------------
        */

        setupLogout();

        setupBackButton();

        setupDashboardButton();

        setupBarcodeInput();

        setupSearchButton();

        setupPaymentButtons();


        /*
        --------------------------------------------------
        Load empty cart
        --------------------------------------------------
        */

        renderCart();

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
// LOGOUT
// ======================================================

function setupLogout() {

    const button =
        document.getElementById(
            "logoutButton"
        );


    if (!button) {
        return;
    }


    button.addEventListener(
        "click",
        async () => {

            const confirmed =
                confirm(
                    "Are you sure you want to logout?"
                );


            if (!confirmed) {
                return;
            }


            button.disabled =
                true;

            button.textContent =
                "Logging out...";


            await POS_API.logoutUser();


            window.location.replace(
                "/index.html"
            );

        }
    );

}


// ======================================================
// BACK BUTTON
// ======================================================

function setupBackButton() {

    const button =
        document.getElementById(
            "backHomeButton"
        );


    if (!button) {
        return;
    }


    button.addEventListener(
        "click",
        event => {

            event.preventDefault();


            window.location.href =
                "/index.html";

        }
    );

}


// ======================================================
// DASHBOARD BUTTON
// ======================================================

function setupDashboardButton() {

    const button =
        document.getElementById(
            "dashboardButton"
        );


    if (!button) {
        return;
    }


    button.addEventListener(
        "click",
        () => {

            window.location.href =
                "/dashboard.html";

        }
    );

}


// ======================================================
// BARCODE INPUT
// ======================================================

function setupBarcodeInput() {

    const input =
        document.getElementById(
            "barcodeInput"
        );


    if (!input) {
        return;
    }


    input.addEventListener(
        "keydown",
        async event => {

            if (
                event.key ===
                "Enter"
            ) {

                event.preventDefault();


                const barcode =
                    input.value.trim();


                if (!barcode) {
                    return;
                }


                await scanProduct(
                    barcode
                );


                input.value =
                    "";


                input.focus();

            }

        }
    );

}


// ======================================================
// SEARCH BUTTON
// ======================================================

function setupSearchButton() {

    const button =
        document.getElementById(
            "searchProductButton"
        );


    if (!button) {
        return;
    }


    button.addEventListener(
        "click",
        async () => {

            const input =
                document.getElementById(
                    "barcodeInput"
                );


            if (!input) {
                return;
            }


            const barcode =
                input.value.trim();


            if (!barcode) {

                showCashierMessage(
                    "Enter or scan a barcode.",
                    "error"
                );

                return;

            }


            await scanProduct(
                barcode
            );


            input.value =
                "";


            input.focus();

        }
    );

}


// ======================================================
// SCAN PRODUCT
// ======================================================

async function scanProduct(
    barcode
) {

    try {

        const result =
            await POS_API.get(

                `/products/barcode/${encodeURIComponent(
                    barcode
                )}`

            );


        if (
            !result ||
            !result.success ||
            !result.product
        ) {

            showCashierMessage(
                "Product not found.",
                "error"
            );

            return;

        }


        addToCart(
            result.product
        );


        showCashierMessage(
            `${result.product.name} added to cart.`,
            "success"
        );

    }

    catch (error) {

        console.error(
            "Barcode search error:",
            error
        );


        showCashierMessage(
            error.message ||
            "Unable to find product.",
            "error"
        );

    }

}


// ======================================================
// ADD TO CART
// ======================================================

function addToCart(
    product
) {

    const existing =
        cart.find(
            item =>
                Number(item.id) ===
                Number(product.id)
        );


    if (existing) {

        if (
            existing.quantity >=
            Number(product.quantity)
        ) {

            showCashierMessage(
                "Not enough stock available.",
                "error"
            );

            return;

        }


        existing.quantity++;

    }

    else {

        cart.push({

            id:
                product.id,

            barcode:
                product.barcode,

            name:
                product.name,

            price:
                Number(
                    product.selling_price
                ),

            quantity:
                1,

            stock:
                Number(
                    product.quantity
                )

        });

    }


    renderCart();

}


// ======================================================
// REMOVE CART ITEM
// ======================================================

function removeFromCart(
    productId
) {

    cart =
        cart.filter(
            item =>
                Number(item.id) !==
                Number(productId)
        );


    renderCart();

}


// ======================================================
// CHANGE QUANTITY
// ======================================================

function changeQuantity(
    productId,
    quantity
) {

    const item =
        cart.find(
            product =>
                Number(product.id) ===
                Number(productId)
        );


    if (!item) {
        return;
    }


    quantity =
        Number(quantity);


    if (
        !Number.isInteger(quantity) ||
        quantity < 1
    ) {

        return;

    }


    if (
        quantity >
        item.stock
    ) {

        showCashierMessage(
            "Quantity exceeds available stock.",
            "error"
        );

        return;

    }


    item.quantity =
        quantity;


    renderCart();

}


// ======================================================
// CART TOTAL
// ======================================================

function getCartTotal() {

    return cart.reduce(

        (
            total,
            item
        ) => {

            return total +
                (
                    item.price *
                    item.quantity
                );

        },

        0

    );

}


// ======================================================
// RENDER CART
// ======================================================

function renderCart() {

    const container =
        document.getElementById(
            "cartItems"
        );


    if (container) {

        container.innerHTML =
            "";


        if (
            cart.length === 0
        ) {

            container.innerHTML = `
                <div class="empty-cart">
                    No products added.
                </div>
            `;

        }

        else {

            cart.forEach(
                item => {

                    const row =
                        document.createElement(
                            "div"
                        );


                    row.className =
                        "cart-item";


                    row.innerHTML = `

                        <div class="cart-product">

                            <strong>
                                ${escapeHTML(
                                    item.name
                                )}
                            </strong>

                            <small>
                                ${escapeHTML(
                                    item.barcode
                                )}
                            </small>

                        </div>


                        <div class="cart-price">

                            KES
                            ${formatMoney(
                                item.price
                            )}

                        </div>


                        <input
                            class="cart-quantity"
                            type="number"
                            min="1"
                            max="${item.stock}"
                            value="${item.quantity}"
                            data-id="${item.id}"
                        >


                        <div class="cart-total">

                            KES
                            ${formatMoney(
                                item.price *
                                item.quantity
                            )}

                        </div>


                        <button
                            type="button"
                            class="remove-cart"
                            data-id="${item.id}"
                        >
                            Remove
                        </button>

                    `;


                    container.appendChild(
                        row
                    );

                }
            );

        }

    }


    /*
    ----------------------------------------------------
    Quantity listeners
    ----------------------------------------------------
    */

    document
        .querySelectorAll(
            ".cart-quantity"
        )
        .forEach(
            input => {

                input.addEventListener(
                    "change",
                    () => {

                        changeQuantity(

                            input.dataset.id,

                            input.value

                        );

                    }
                );

            }
        );


    /*
    ----------------------------------------------------
    Remove listeners
    ----------------------------------------------------
    */

    document
        .querySelectorAll(
            ".remove-cart"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        removeFromCart(
                            button.dataset.id
                        );

                    }
                );

            }
        );


    /*
    ----------------------------------------------------
    Totals
    ----------------------------------------------------
    */

    const total =
        getCartTotal();


    setText(
        "cartTotal",
        formatMoney(total)
    );


    setText(
        "subtotal",
        formatMoney(total)
    );

}


// ======================================================
// PAYMENT BUTTONS
// ======================================================

function setupPaymentButtons() {

    const cashButton =
        document.getElementById(
            "cashPaymentButton"
        );


    const mpesaButton =
        document.getElementById(
            "mpesaPaymentButton"
        );


    if (cashButton) {

        cashButton.addEventListener(
            "click",
            () => {

                processCashPayment();

            }
        );

    }


    if (mpesaButton) {

        mpesaButton.addEventListener(
            "click",
            () => {

                processMpesaPayment();

            }
        );

    }

}


// ======================================================
// CASH PAYMENT
// ======================================================

async function processCashPayment() {

    if (
        cart.length === 0
    ) {

        showCashierMessage(
            "Cart is empty.",
            "error"
        );

        return;

    }


    const amount =
        getCartTotal();


    const received =
        prompt(
            `Total: KES ${formatMoney(amount)}\n\nCash received:`
        );


    if (
        received === null
    ) {

        return;

    }


    const cash =
        Number(
            received
        );


    if (
        !Number.isFinite(cash) ||
        cash < amount
    ) {

        showCashierMessage(
            "Cash received is not enough.",
            "error"
        );

        return;

    }


    const change =
        cash -
        amount;


    try {

        const result =
            await POS_API.post(
                "/sales",
                {

                    items:
                        cart.map(
                            item => ({

                                product_id:
                                    item.id,

                                barcode:
                                    item.barcode,

                                quantity:
                                    item.quantity

                            })
                        ),

                    payment_method:
                        "cash",

                    amount_received:
                        cash

                }
            );


        if (
            !result.success
        ) {

            throw new Error(
                result.message ||
                "Sale failed."
            );

        }


        showCashierMessage(
            `Sale complete. Change: KES ${formatMoney(change)}`,
            "success"
        );


        clearCart();

    }

    catch (error) {

        console.error(
            "Cash payment error:",
            error
        );


        showCashierMessage(
            error.message ||
            "Unable to complete sale.",
            "error"
        );

    }

}


// ======================================================
// MPESA PAYMENT
// ======================================================

async function processMpesaPayment() {

    if (
        cart.length === 0
    ) {

        showCashierMessage(
            "Cart is empty.",
            "error"
        );

        return;

    }


    const phone =
        prompt(
            "Enter M-Pesa phone number:"
        );


    if (!phone) {
        return;
    }


    try {

        const result =
            await POS_API.post(
                "/sales/mpesa",
                {

                    items:
                        cart.map(
                            item => ({

                                product_id:
                                    item.id,

                                barcode:
                                    item.barcode,

                                quantity:
                                    item.quantity

                            })
                        ),

                    phone_number:
                        phone

                }
            );


        if (
            !result.success
        ) {

            throw new Error(
                result.message ||
                "Unable to initiate M-Pesa payment."
            );

        }


        showCashierMessage(
            result.message ||
            "M-Pesa payment request sent to the customer.",
            "success"
        );


        /*
        --------------------------------------------------
        Do not clear cart immediately.
        The backend should confirm the M-Pesa callback
        before the sale is finalized.
        --------------------------------------------------
        */

    }

    catch (error) {

        console.error(
            "M-Pesa error:",
            error
        );


        showCashierMessage(
            error.message ||
            "M-Pesa payment failed.",
            "error"
        );

    }

}


// ======================================================
// CLEAR CART
// ======================================================

function clearCart() {

    cart = [];

    renderCart();

}


// ======================================================
// MESSAGE
// ======================================================

function showCashierMessage(
    message,
    type = "success"
) {

    const element =
        document.getElementById(
            "cashierMessage"
        );


    if (!element) {

        alert(
            message
        );

        return;

    }


    element.textContent =
        message;


    element.className =
        `cashier-message ${type}`;


    setTimeout(
        () => {

            element.textContent =
                "";

            element.className =
                "cashier-message";

        },

        4000
    );

}


// ======================================================
// FORMAT MONEY
// ======================================================

function formatMoney(
    amount
) {

    return Number(
        amount || 0
    ).toLocaleString(
        "en-KE",
        {

            minimumFractionDigits:
                2,

            maximumFractionDigits:
                2

        }
    );

}


// ======================================================
// ESCAPE HTML
// ======================================================

function escapeHTML(
    value
) {

    return String(
        value ?? ""
    )
    .replace(
        /&/g,
        "&amp;"
    )
    .replace(
        /</g,
        "&lt;"
    )
    .replace(
        />/g,
        "&gt;"
    )
    .replace(
        /"/g,
        "&quot;"
    )
    .replace(
        /'/g,
        "&#039;"
    );

}


// ======================================================
// GLOBAL ACCESS
// ======================================================

window.POSCashier = {

    getCart: () =>
        [...cart],

    clearCart,

    addToCart,

    removeFromCart,

    changeQuantity,

    getCartTotal,

    scanProduct

};
