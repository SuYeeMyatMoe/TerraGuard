import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  // Three.js cameras, GPU materials and renderer objects are mutable engine resources.
  // React Compiler's immutability rule treats these R3F objects as React state.
  {
    files: ["src/components/scene/ForestScene.tsx", "src/components/scene/ForestOverview.tsx", "src/components/scene/SceneQuality.tsx"],
    rules: { "react-hooks/immutability": "off" },
  },
  // Acquire the shared GPU lease after commit and publish it before the first paint.
  // Acquiring during render could leak a lease when React abandons that render.
  {
    files: ["src/components/scene/NaturalTrees.tsx"],
    rules: { "react-hooks/set-state-in-effect": "off" },
  },
  globalIgnores(["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    files: ["tests/**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);
