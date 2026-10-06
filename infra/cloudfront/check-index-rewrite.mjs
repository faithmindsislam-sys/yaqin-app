import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const context = {};
const source = readFileSync(new URL("./index-rewrite.js", import.meta.url), "utf8");
assert(Buffer.byteLength(source) <= 10000, "CloudFront function exceeds the 10 KB limit");
runInNewContext(source, context);
const routes = JSON.parse(readFileSync(new URL("../../web/src/lib/routes.json", import.meta.url), "utf8"));
assert.deepEqual(JSON.parse(JSON.stringify(context.ROUTES)), Object.fromEntries(Object.entries(routes).map(([p, r]) => [p, [r.surface, r.path]])), "Frontend and edge must use the same route table");
function request(host, uri, method = "GET", headers = {}, querystring = {}) {
  return context.handler({ request: { method, uri, querystring, headers: { host: { value: host }, ...headers } } });
}
const origins = {site:"https://www.yaqeenguide.com",app:"https://app.yaqeenguide.com",studio:"https://studio.yaqeenguide.com"};
const hosts = ["yaqeenguide.com", "www.yaqeenguide.com", "app.yaqeenguide.com", "studio.yaqeenguide.com", "d1x2w48x0bzbrs.cloudfront.net"];
const navigation = { "sec-fetch-mode": { value: "navigate" }, accept: { value: "text/html" } };
let checked = 0;
for (const host of hosts) for (const [path, entry] of Object.entries(routes)) {
  let route = entry;
  if (path === "/" && host === "app.yaqeenguide.com") route = {surface:"app",path:"/learn/"};
  if (path === "/" && host === "studio.yaqeenguide.com") route = {surface:"studio",path:"/courses/"};
  for (const uri of new Set([path, path === "/" ? "/index.html" : path.slice(0, -1), path + "index.html", path === "/" ? "/index.html" : path.slice(0, -1) + ".html"])) {
    const result = request(host, uri, "GET", navigation);
    const target = origins[route.surface] + route.path;
    if ("https://" + host + uri === target) {
      assert.equal(result.uri, path + "index.html");
    } else {
      assert.equal(result.statusCode, 308);
      assert.equal(result.headers.location.value, target);
      const resolved = new URL(target);
      assert(!request(resolved.hostname, resolved.pathname, "GET", navigation).statusCode, "Canonical target loops: " + target);
    }
    checked++;
  }
}
const qs = { id: { value: "a b" }, tag: { multiValue: [{value:"one"},{value:"two"}] }, empty:{value:""} };
assert.equal(request("www.yaqeenguide.com", "/studio/course/", "GET", navigation, qs).headers.location.value,
  "https://studio.yaqeenguide.com/editor/?id=a%20b&tag=one&tag=two&empty");
for (const host of hosts) for (const method of ["GET", "HEAD"]) for (const headers of [
  {"sec-fetch-mode":{value:"cors"},accept:{value:"*/*"}}, {rsc:{value:"1"}}, {"next-router-prefetch":{value:"1"}}, {accept:{value:"*/*"}},
]) assert.equal(request(host, "/library/", method, headers).uri, "/library/index.html");
for (const host of hosts) for (const path of ["/_next/static/chunk.js", "/data/content.json", "/resources/quran/audio/a.mp3", "/api/health", "/audio/shahada.mp3", "/yaqeen-logo.png"]) assert.equal(request(host, path, "GET", navigation).uri, path);
assert.equal(request("studio.yaqeenguide.com", "/index.txt").uri, "/courses/index.txt");
assert.equal(request("d1x2w48x0bzbrs.cloudfront.net", "/").headers.location.value, "https://www.yaqeenguide.com/");
assert.equal(request("d1x2w48x0bzbrs.cloudfront.net", "/studio/").headers.location.value, "https://studio.yaqeenguide.com/courses/");
assert.equal(request("yaqeenguide.com", "/missing/").uri, "/missing/index.html");
assert.equal(request("app.yaqeenguide.com", "/App/Learn/").headers.location.value, "https://app.yaqeenguide.com/learn/");
assert.equal(request("public-api.yaqeenguide.com", "/").headers.location.value, "https://public-api.yaqeenguide.com/api/v1/docs");
assert.equal(request("public-api.yaqeenguide.com", "/", "HEAD").statusCode, 308);
for (const path of ["/learn/", "/oauth/consent/", "/_next/static/chunk.js", "/missing/", "/api/admin/users", "/api/content", "/api/docs"]) {
  const response = request("public-api.yaqeenguide.com", path);
  assert.equal(response.statusCode, 404, "API host must not serve static web pages/assets");
  assert.equal(JSON.parse(response.body).error.code, "not_found");
}
assert.equal(request("public-api.yaqeenguide.com", "/", "POST").statusCode, 404);
assert.equal(request("app.yaqeenguide.com", "/.well-known/oauth-protected-resource/api/v1/mcp/").uri, "/.well-known/oauth-protected-resource/api/v1/mcp/");
for (const path of ["/api/v1/courses", "/api/v1/mcp/", "/.well-known/oauth-protected-resource/api/v1/mcp/"]) {
  const response = request("public-api.yaqeenguide.com", path, "POST", {authorization:{value:"Bearer fixture"}}, qs);
  assert.equal(response.uri, path);
  assert.equal(response.headers.authorization.value, "Bearer fixture");
  assert.deepEqual(response.querystring, qs);
}
for (const method of ["GET", "POST", "HEAD"]) {
  const response = request("public-api.yaqeenguide.com", "/api/v1/mcp", method, {authorization:{value:"Bearer fixture"}}, qs);
  assert.equal(response.uri, "/api/v1/mcp/", "Slashless MCP must reach the authenticated transport without a redirect");
  assert.equal(response.statusCode, undefined);
  assert.equal(response.headers.authorization.value, "Bearer fixture");
  assert.deepEqual(response.querystring, qs);
}
console.log(`PASS ${checked} edge route cases: domain ownership, clean paths, legacy/HTML redirects, no loops, queries, assets and same-origin background requests.`);
