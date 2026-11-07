/** Pure, client-side input checks; the server must validate independently. */
export function validateLogin(values) {
  const errors = {};
  const email = String(values?.email ?? '').trim();
  const password = String(values?.password ?? '');
  if (!email) errors.email = 'Enter your email address.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.';
  if (!password) errors.password = 'Enter your password.';
  return errors;
}

export function validateRegister(values) {
  const errors = validateLogin(values);
  const username = String(values?.username ?? '').trim();
  const password = String(values?.password ?? '');
  const confirmPassword = String(values?.confirmPassword ?? '');
  if (username.length < 3 || username.length > 32 || !/^[A-Za-z0-9._-]+$/.test(username)) {
    errors.username = 'Use 3–32 letters, numbers, dots, underscores or hyphens.';
  }
  if (password && password.length < 8) errors.password = 'Use at least 8 characters.';
  if (!confirmPassword) errors.confirmPassword = 'Confirm your password.';
  else if (confirmPassword !== password) errors.confirmPassword = 'Passwords do not match.';
  return errors;
}

export function hasValidationErrors(errors) {
  return Object.keys(errors).length > 0;
}
