import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

/**
 * A hash with no corresponding user — compare against it (and discard the result)
 * when login receives an unknown email. Without this, "email doesn't exist" (instant
 * response) and "email exists, wrong password" (~hundreds of ms for bcrypt.compare)
 * are distinguishable by response time, which allows enumerating existing accounts. A
 * fixed hash keeps the response time consistent regardless of the specific user.
 */
export const DUMMY_PASSWORD_HASH =
  "$2b$12$4m/Vo9D/mtKm3InEoyviMuIdo51fsyICW9PcjIcyUNXW4Ds9rGPTO";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
