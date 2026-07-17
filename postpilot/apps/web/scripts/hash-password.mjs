import bcrypt from "bcryptjs";

const password = process.argv[2];

if (!password) {
  console.error("Usage: npm run hash -- 'your strong password'");
  process.exit(1);
}

if (password.length < 12) {
  console.error("Use at least 12 characters for the administrator password.");
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
console.log(`ADMIN_PASSWORD_HASH='${hash}'`);
console.log(`ADMIN_PASSWORD_HASH_BASE64=${Buffer.from(hash, "utf8").toString("base64")}`);
