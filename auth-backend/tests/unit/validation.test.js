"use strict";

require("../helpers/env");

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { validateRegister, validateLogin } = require("../../utils/validation");

const valid = {
    username: "jeevith",
    email: "jeevith@example.com",
    password: "password123"
};

test("register: valid input passes and is normalised", () => {
    const { value, errors } = validateRegister({
        username: "  jeevith  ",
        email: "  Jeevith@Example.COM ",
        password: "password123"
    });

    assert.deepEqual(errors, {});
    assert.deepEqual(value, valid);
});

test("register: missing body (Express 5 gives undefined) reports every field", () => {
    for (const body of [undefined, null, {}, [], "text", 42]) {
        const { errors } = validateRegister(body);

        assert.deepEqual(Object.keys(errors).sort(), ["email", "password", "username"]);
    }
});

test("register: wrong types are rejected, not coerced", () => {
    const { errors } = validateRegister({
        username: { $ne: "" },
        email: ["a@b.co"],
        password: 12345678
    });

    assert.deepEqual(Object.keys(errors).sort(), ["email", "password", "username"]);
});

test("register: username rules", () => {
    const bad = ["ab", "x".repeat(51), "bad<script>", "semi;colon", "   "];

    for (const username of bad) {
        assert.ok(validateRegister({ ...valid, username }).errors.username, username);
    }

    for (const username of ["abc", "Jeevith K", "j.k_dev-1", "ஜீவித்", "x".repeat(50)]) {
        assert.equal(validateRegister({ ...valid, username }).errors.username, undefined, username);
    }
});

test("register: email rules", () => {
    for (const email of ["nope", "a@b", "a b@c.com", "@c.com", "a@@c.com", `${"x".repeat(100)}@c.com`]) {
        assert.ok(validateRegister({ ...valid, email }).errors.email, email);
    }

    assert.equal(validateRegister({ ...valid, email: "o'brien+tag@sub.example.co.in" }).errors.email, undefined);
});

test("register: password rules (min length, 72-byte bcrypt limit, NUL)", () => {
    assert.ok(validateRegister({ ...valid, password: "short" }).errors.password);
    assert.ok(validateRegister({ ...valid, password: "a".repeat(73) }).errors.password);
    assert.ok(validateRegister({ ...valid, password: "ok-password\0x" }).errors.password);

    assert.equal(validateRegister({ ...valid, password: "a".repeat(72) }).errors.password, undefined);

    // 24 three-byte characters = 72 bytes OK; 25 = 75 bytes too long,
    // even though 25 < 72 characters.
    assert.equal(validateRegister({ ...valid, password: "€".repeat(24) }).errors.password, undefined);
    assert.ok(validateRegister({ ...valid, password: "€".repeat(25) }).errors.password);
});

test("register: passwords are never trimmed or altered", () => {
    const { value } = validateRegister({ ...valid, password: "  spaced pass  " });

    assert.equal(value.password, "  spaced pass  ");
});

test("login: valid input", () => {
    const { value, errors } = validateLogin({ email: " Jeevith@Example.com ", password: "x" });

    assert.deepEqual(errors, {});
    assert.deepEqual(value, { email: "jeevith@example.com", password: "x" });
});

test("login: requires both fields and does not enforce the registration password policy", () => {
    assert.deepEqual(Object.keys(validateLogin(undefined).errors).sort(), ["email", "password"]);
    assert.deepEqual(Object.keys(validateLogin({ email: 1, password: {} }).errors).sort(), ["email", "password"]);

    // A short password is a normal "wrong password", not a validation hint.
    assert.deepEqual(validateLogin({ email: "a@b.co", password: "1" }).errors, {});

    assert.ok(validateLogin({ email: "a@b.co", password: "x".repeat(1025) }).errors.password);
});
