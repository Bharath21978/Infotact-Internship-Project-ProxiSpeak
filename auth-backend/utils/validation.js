"use strict";

// --------------------------------------------------
// INPUT VALIDATION
//
// Each validator returns { value, errors }.
//   errors: { fieldName: "message" }  (empty object when valid)
// Values are type-checked first, so objects/arrays/numbers sent where a
// string is expected are rejected instead of being coerced.
// --------------------------------------------------

const USERNAME_MIN = 3;
const USERNAME_MAX = 50;
const EMAIL_MAX = 100;
const PASSWORD_MIN = 8;

// bcrypt only uses the first 72 BYTES of a password. Rejecting longer
// input is safer than silently truncating it.
const PASSWORD_MAX_BYTES = 72;

// Letters and combining marks (\p{M} is required for Tamil, Hindi and
// other Indic scripts, whose vowel signs are marks), digits, space,
// dot, underscore, hyphen.
const USERNAME_PATTERN = /^[\p{L}\p{M}\p{N} ._-]+$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function asObject(body) {
    // Express 5 leaves req.body undefined when no body was parsed.
    return body !== null && typeof body === "object" && !Array.isArray(body)
        ? body
        : {};
}

function validateUsername(raw, errors) {
    if (typeof raw !== "string" || raw.trim() === "") {
        errors.username = "Username is required";
        return undefined;
    }

    const username = raw.trim();

    if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
        errors.username =
            `Username must be ${USERNAME_MIN}-${USERNAME_MAX} characters long`;
        return undefined;
    }

    if (!USERNAME_PATTERN.test(username)) {
        errors.username =
            "Username may only contain letters, numbers, spaces, " +
            "dots, underscores and hyphens";
        return undefined;
    }

    return username;
}

function validateEmail(raw, errors) {
    if (typeof raw !== "string" || raw.trim() === "") {
        errors.email = "Email is required";
        return undefined;
    }

    const email = raw.trim().toLowerCase();

    if (email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email)) {
        errors.email = "Enter a valid email address";
        return undefined;
    }

    return email;
}

function validateNewPassword(raw, errors) {
    if (typeof raw !== "string" || raw === "") {
        errors.password = "Password is required";
        return undefined;
    }

    if (raw.length < PASSWORD_MIN) {
        errors.password =
            `Password must be at least ${PASSWORD_MIN} characters long`;
        return undefined;
    }

    if (Buffer.byteLength(raw, "utf8") > PASSWORD_MAX_BYTES) {
        errors.password =
            `Password must be at most ${PASSWORD_MAX_BYTES} bytes long`;
        return undefined;
    }

    if (raw.includes("\0")) {
        errors.password = "Password contains invalid characters";
        return undefined;
    }

    return raw;
}

function validateRegister(body) {
    const input = asObject(body);
    const errors = {};

    const value = {
        username: validateUsername(input.username, errors),
        email: validateEmail(input.email, errors),
        password: validateNewPassword(input.password, errors)
    };

    return { value, errors };
}

// Login deliberately does NOT enforce the password policy: it only needs
// "present and not absurdly large", and must not reveal the policy.
function validateLogin(body) {
    const input = asObject(body);
    const errors = {};

    const email = validateEmail(input.email, errors);

    let password;

    if (typeof input.password !== "string" || input.password === "") {
        errors.password = "Password is required";
    } else if (input.password.length > 1024) {
        errors.password = "Password is too long";
    } else {
        password = input.password;
    }

    return { value: { email, password }, errors };
}

module.exports = { validateRegister, validateLogin };
