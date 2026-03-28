const path = require("path");
const fs = require("fs");

// Find route.ts handler files in a directory tree (Next.js-style routing).
// Each route.ts compiles to route.js at the same relative path.
function findRouteHandlers(dir, baseDir, prefix) {
  const entries = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      Object.assign(entries, findRouteHandlers(fullPath, baseDir, prefix));
    } else if (entry.name === "route.ts") {
      const relative = path.relative(baseDir, fullPath).replace(/\\/g, "/");
      const name = relative.replace(".ts", "");
      entries[`${prefix}/${name}`] =
        `./${path.relative(__dirname, fullPath).replace(/\\/g, "/")}`;
    }
  }
  return entries;
}

// Find named .ts handler files (for system, tables, agents directories)
function findHandlers(dir, baseDir, prefix) {
  const entries = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      Object.assign(entries, findHandlers(fullPath, baseDir, prefix));
    } else if (entry.name.endsWith(".ts") && entry.name !== "index.ts") {
      const relative = path.relative(baseDir, fullPath).replace(/\\/g, "/");
      const name = relative.replace(".ts", "");
      entries[`${prefix}/${name}`] =
        `./${path.relative(__dirname, fullPath).replace(/\\/g, "/")}`;
    }
  }
  return entries;
}

// Find all API route handlers (route.ts files only)
const apiDir = path.resolve(__dirname, "src/api");
const handlers = fs.existsSync(apiDir) ? findRouteHandlers(apiDir, apiDir, "api") : {};

// Find all system handler files (recursive)
const systemDir = path.resolve(__dirname, "src/system");
if (fs.existsSync(systemDir)) {
  Object.assign(handlers, findHandlers(systemDir, systemDir, "system"));
}

// Find all table script files (recursive)
const tablesDir = path.resolve(__dirname, "src/tables");
if (fs.existsSync(tablesDir)) {
  Object.assign(handlers, findHandlers(tablesDir, tablesDir, "tables"));
}

// Find all agent script files (recursive)
const agentsDir = path.resolve(__dirname, "src/agents");
if (fs.existsSync(agentsDir)) {
  Object.assign(handlers, findHandlers(agentsDir, agentsDir, "agents"));
}

module.exports = {
  entry: handlers,
  target: "node",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
    library: {
      type: "commonjs2",
    },
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js", ".jsx"],
    alias: {
      "@": path.resolve(__dirname),
    },
    symlinks: true,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: "ts-loader",
          options: {
            configFile: "tsconfig.webpack.json",
            transpileOnly: true,
          },
        },
        exclude: /node_modules/,
      },
    ],
  },
  externals: {
    "next/server": "commonjs2 next/server",
    ioredis: "commonjs2 ioredis",
    uuid: "commonjs2 uuid",
    bcryptjs: "commonjs2 bcryptjs",
    sharp: "commonjs2 sharp",
  },
  mode: "production",
};
