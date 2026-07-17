import { FlatCompat } from "@eslint/eslintrc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: dirname });

const config = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Media URLs are runtime R2 assets. The raw element avoids hostname allowlists
      // and Vercel image-proxy egress while preserving direct public-platform URLs.
      "@next/next/no-img-element": "off",
    },
  },
];

export default config;
