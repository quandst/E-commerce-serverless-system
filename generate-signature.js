const crypto = require('crypto');

// Thông tin cần thiết
const webhookSecret = 'whsec_qOzhnktUo3Mkqesqn0UOsbRgUqjktBU6'; // Lấy từ Stripe Dashboard
const payload = JSON.stringify({

    "object": {
        "id": "pi_3R3qbxB0j1O5ihfW065hzKkz",
        "object": "payment_intent",
        "amount": 7196,
        "amount_capturable": 0,
        "amount_details": {
            "tip": {}
        },
        "amount_received": 0,
        "application": null,
        "application_fee_amount": null,
        "automatic_payment_methods": {
            "allow_redirects": "always",
            "enabled": true
        },
        "canceled_at": null,
        "cancellation_reason": null,
        "capture_method": "automatic_async",
        "client_secret": "pi_3R3qbxB0j1O5ihfW065hzKkz_secret_Kp3zQfaZBqPvE0xHNwFWZWHmY",
        "confirmation_method": "automatic",
        "created": 1742267677,
        "currency": "usd",
        "customer": null,
        "description": "Order For Admin, Amount: US$7196, Date Initiated: Mar 18, 2025",
        "invoice": null,
        "last_payment_error": null,
        "latest_charge": null,
        "livemode": false,
        "metadata": {
            "user": "admin"
        },
        "next_action": null,
        "on_behalf_of": null,
        "payment_method": null,
        "payment_method_configuration_details": {
            "id": "pmc_1QrIZkB0j1O5ihfWj8fTpRte",
            "parent": null
        },
        "payment_method_options": {
            "affirm": {},
            "amazon_pay": {
                "express_checkout_element_session_id": null
            },
            "card": {
                "installments": null,
                "mandate_options": null,
                "network": null,
                "request_three_d_secure": "automatic"
            },
            "cashapp": {},
            "klarna": {
                "preferred_locale": null
            },
            "link": {
                "persistent_token": null
            }
        },
        "payment_method_types": [
            "card",
            "klarna",
            "link",
            "affirm",
            "cashapp",
            "amazon_pay"
        ],
        "processing": null,
        "receipt_email": null,
        "review": null,
        "setup_future_usage": null,
        "shipping": null,
        "source": null,
        "statement_descriptor": null,
        "statement_descriptor_suffix": null,
        "status": "requires_payment_method",
        "transfer_data": null,
        "transfer_group": null
    },
    "previous_attributes": null
});

console.log(payload);
// Tạo timestamp và chữ ký
const timestamp = Math.floor(Date.now() / 1000);
const signedPayload = `${timestamp}.${payload}`;

// Tạo chữ ký v1
const signatureV1 = crypto
    .createHmac('sha256', webhookSecret)
    .update(signedPayload)
    .digest('hex');

// Tạo chữ ký v0 (ví dụ, có thể sử dụng một secret khác hoặc cùng secret)
const signatureV0 = crypto
    .createHmac('sha256', webhookSecret)
    .update(payload) // Không cần timestamp cho v0
    .digest('hex');

// Tạo header
const headers = {
    'Stripe-Signature': `t=${timestamp},v1=${signatureV1},v0=${signatureV0}`,
    'Content-Type': 'application/json'
};

console.log(headers);