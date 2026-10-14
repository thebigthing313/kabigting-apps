/** @type {import("prettier").Config & import("prettier-plugin-tailwindcss").PluginOptions} */
export default {
  semi: false,
  singleQuote: false,
  trailingComma: "all",
  printWidth: 100,
  tabWidth: 2,
  endOfLine: "lf",
  // Must stay last in the list.
  plugins: ["prettier-plugin-tailwindcss"],
  tailwindStylesheet: "./src/client/styles.css",
  tailwindFunctions: ["cn", "cva"],
}
