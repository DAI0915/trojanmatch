import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The service-role client may ONLY be used by demo routes and scripts.
    files: ["**/*.{ts,tsx}"],
    ignores: ["app/api/demo/**", "lib/demo/**", "scripts/**", "tests/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/demo/admin", "**/lib/demo/admin"],
              message: "Service-role client is restricted to app/api/demo/* and scripts/*.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.object.name='process'][object.property.name='env'][property.name='SUPABASE_SERVICE_ROLE_KEY']",
          message: "SUPABASE_SERVICE_ROLE_KEY may only be read in lib/demo/*, app/api/demo/* or scripts/*.",
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "lib/database.types.ts"]),
]);

export default eslintConfig;
