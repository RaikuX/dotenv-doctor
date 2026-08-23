import * as esbuild from "esbuild";

const common = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  sourcemap: false,
  minify: false,
  logLevel: "warning",
};

await esbuild.build({
  ...common,
  entryPoints: ["src/cli.ts"],
  outfile: "dist/cli.js",
});

await esbuild.build({
  ...common,
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
});
