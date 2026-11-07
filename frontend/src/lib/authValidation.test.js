import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLogin, validateRegister, hasValidationErrors } from './authValidation.js';

test('login requires email and password', () => {
  assert.deepEqual(validateLogin({ email: '', password: '' }), {
    email: 'Enter your email address.', password: 'Enter your password.',
  });
});
test('login rejects invalid email', () => {
  assert.ok(validateLogin({ email: 'invalid@', password: 'secret' }).email);
});
test('login permits existing passwords without signup policy', () => {
  assert.deepEqual(validateLogin({ email: 'a@example.com', password: 'x' }), {});
});
test('signup enforces username and password length', () => {
  const errors = validateRegister({ username: 'a', email: 'a@example.com', password: '123', confirmPassword: '123' });
  assert.ok(errors.username);
  assert.ok(errors.password);
});
test('signup checks password confirmation', () => {
  assert.ok(validateRegister({ username: 'alice', email: 'a@example.com', password: 'password123', confirmPassword: 'nope' }).confirmPassword);
});
test('signup succeeds with valid values', () => {
  assert.deepEqual(validateRegister({ username: 'alice_2', email: 'alice@example.com', password: 'password123', confirmPassword: 'password123' }), {});
});
test('error helper reports empty and nonempty maps correctly', () => {
  assert.equal(hasValidationErrors({}), false);
  assert.equal(hasValidationErrors({ email: 'Missing' }), true);
});
