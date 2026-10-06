// Resolve source imports for focused checks, so thin routes and colocated feature
// modules are exercised without depending on the production bundle layout.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const src = fileURLToPath(new URL("../src/", import.meta.url));
export function loadSource(path, imports = {}, globals = {}) {
  const file = path instanceof URL ? fileURLToPath(path) : path;
  const mod = { exports: {} };
  const source = readFileSync(file, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(compiled, { module: mod, exports: mod.exports, URL, URLSearchParams, ...globals, require: (name) => {
    if (name in imports) return imports[name];
    if (name === "@/components/RouteLink" && "next/link" in imports) return imports["next/link"];
    if (name === "@/lib/navigation" && "next/navigation" in imports) return imports["next/navigation"];
    if (name.endsWith(".css")) return {};
    // Static component checks inspect Image's props; real loading is covered by the browser checks.
    if (name === "next/image") return { default: "img" };
    const target = name.startsWith("@/") ? resolve(src, name.slice(2)) : name.startsWith(".") ? resolve(dirname(file), name) : null;
    if (target) {
      const alias = "@/" + target.slice(src.length);
      if (alias in imports) return imports[alias];
      const found = [target, `${target}.ts`, `${target}.tsx`].find((file) => existsSync(file));
      if (found?.endsWith(".json")) return { default: JSON.parse(readFileSync(found, "utf8")) };
      if (found) return loadSource(found, imports, globals);
    }
    throw new Error(`Unexpected import ${name} in ${file}`);
  } });
  return mod.exports;
}
