import luainjs from "lua-in-js";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve as resolvePath } from "node:path";
import { cwd } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const baseURL = pathToFileURL(`${cwd()}/`).href;
const extensionsRegex = /\.lua$/;

export async function resolve(specifier, context, defaultResolve) {
  const { parentURL = baseURL } = context;

  // Node.js normally errors on unknown file extensions, so return a URL for
  // specifiers ending in the CoffeeScript file extensions.
  if (extensionsRegex.test(specifier)) {
    return {
      url: new URL(specifier, parentURL).href,
    };
  }

  // Let Node.js handle all other specifiers.
  return defaultResolve(specifier, context, defaultResolve);
}

export async function load(url, context, defaultLoad) {
  // Now that we patched resolve to let CoffeeScript URLs through, we need to
  // tell Node.js what format such URLs should be interpreted as. Because
  // CoffeeScript transpiles into JavaScript, it should be one of the two
  // JavaScript formats: 'commonjs' or 'module'.
  if (extensionsRegex.test(url)) {
    // CoffeeScript files can be either CommonJS or ES modules, so we want any
    // CoffeeScript file to be treated by Node.js the same as a .js file at the
    // same location. To determine how Node.js would interpret an arbitrary .js
    // file, search up the file system for the nearest parent package.json file
    // and read its "type" field.
    const format = await getPackageType(url);
    // When a hook returns a format of 'commonjs', `source` is be ignored.
    // To handle CommonJS files, a handler needs to be registered with
    // `require.extensions` in order to process the files with the CommonJS
    // loader. Avoiding the need for a separate CommonJS handler is a future
    // enhancement planned for ES module loaders.
    if (format === "commonjs") {
      return { format };
    }

    const { source: rawSource } = await defaultLoad(url, { format });
    // This hook converts CoffeeScript source code into JavaScript source code
    // for all imported CoffeeScript files.
    // console.log(rawSource.toString("utf8"));

    const luaEnv = luainjs.createEnv();
    const luaScript = luaEnv.parse(rawSource.toString("utf8"));
    const key = `__LUASCRIPT_${~~(Math.random() * 100000)}`;

    globalThis[key] = luaScript;

    const transformedSource = `\
      globalThis.${key}.exec();
    `;

    return {
      format,
      source: transformedSource,
    };
  }

  // Let Node.js handle all other URLs.
  return defaultLoad(url, context, defaultLoad);
}

async function getPackageType(url) {
  // `url` is only a file path during the first iteration when passed the
  // resolved url from the load() hook
  // an actual file path from load() will contain a file extension as it's
  // required by the spec
  // this simple truthy check for whether `url` contains a file extension will
  // work for most projects but does not cover some edge-cases (such as
  // extensionless files or a url ending in a trailing space)
  const isFilePath = !!extname(url);
  // If it is a file path, get the directory it's in
  const dir = isFilePath ? dirname(fileURLToPath(url)) : url;
  // Compose a file path to a package.json in the same directory,
  // which may or may not exist
  const packagePath = resolvePath(dir, "package.json");
  // Try to read the possibly nonexistent package.json
  const type = await readFile(packagePath, { encoding: "utf8" })
    .then((filestring) => JSON.parse(filestring).type)
    .catch((err) => {
      if (err?.code !== "ENOENT") console.error(err);
    });
  // Ff package.json existed and contained a `type` field with a value, voila
  if (type) return type;
  // Otherwise, (if not at the root) continue checking the next directory up
  // If at the root, stop and return false
  return dir.length > 1 && getPackageType(resolvePath(dir, ".."));
}
