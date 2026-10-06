import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { loadSource } from "./load-source.mjs";

const routes = JSON.parse(readFileSync(new URL("../src/lib/routes.json", import.meta.url), "utf8"));
const globals = { URL, URLSearchParams };
const policy = loadSource(new URL("../src/lib/routes.ts", import.meta.url), {}, globals);
const { ORIGINS, routeUrl, returnPath, isStudioRoute } = policy;
for (const [path, route] of Object.entries(routes)) {
  for (const host of ["yaqeenguide.com", "www.yaqeenguide.com", "app.yaqeenguide.com", "studio.yaqeenguide.com"]) assert.equal(routeUrl(path + "?id=a%26b#part", host), ORIGINS[route.surface] + route.path + "?id=a%26b#part");
  assert.equal(routeUrl(path, "localhost"), path);
  assert.equal(routeUrl(path, "127.0.0.1"), path);
}
for (const path of ["https://evil.test/", "//evil.test/", "/\\evil.test/", "/%5cevil.test/", "/signin/", "/auth/callback/", "/auth/bridge/", "/reset-password/", "/privacy/", "/missing/", "/studio/../../signin/"]) assert.equal(returnPath(path), null, path);
assert.equal(returnPath("/studio/course/?id=test&part=course"), "/studio/course/?id=test&part=course");
assert.equal(returnPath("/editor/?id=test"), "/editor/?id=test");
assert.equal(routeUrl("https://www.yaqeenguide.com/app/learn/?track=explore", "app.yaqeenguide.com"), ORIGINS.app + "/learn/?track=explore");
assert.equal(routeUrl("/App/Learn/", "app.yaqeenguide.com"), ORIGINS.app + "/learn/");
assert.equal(routeUrl("https://external.test/", "app.yaqeenguide.com"), "https://external.test/");
assert.equal(isStudioRoute("/", "studio.yaqeenguide.com"), true);
assert.equal(isStudioRoute("/course/", "app.yaqeenguide.com"), false);
assert.equal(policy.signInPath("/?tab=review", "studio.yaqeenguide.com"), "/signin/?next=%2Fstudio%2F%3Ftab%3Dreview");
function inventory(dir, prefix = "") {
  for (const entry of readdirSync(dir, {withFileTypes:true})) {
    if (entry.isDirectory()) inventory(new URL(entry.name + "/", dir), prefix + entry.name + "/");
    else if (entry.name === "page.tsx") assert(routes["/" + prefix], "Unclassified page: /" + prefix);
  }
}
inventory(new URL("../src/app/", import.meta.url));
const calls = [];
const location = { hostname:"app.yaqeenguide.com",origin:ORIGINS.app,assign:(url)=>calls.push(["assign",url]),replace:(url)=>calls.push(["replace",url]) };
const router = loadSource(new URL("../src/lib/navigation.ts", import.meta.url), {
  react:{useMemo:fn=>fn()}, "next/navigation":{useRouter:()=>({push:(url,options)=>calls.push(["push",url,options]),replace:(url,options)=>calls.push(["replace-next",url,options])})},
}, { ...globals, window:{location} }).useRouter();
router.push("/learn/"); router.push("/studio/course/?id=a"); router.replace("/privacy/");
assert.deepEqual(calls.slice(0,3), [["push","/learn/",undefined],["assign",ORIGINS.studio+"/editor/?id=a"],["replace",ORIGINS.site+"/privacy/"]]);
location.hostname = "studio.yaqeenguide.com"; location.origin=ORIGINS.studio;
router.push("/studio/"); router.replace("/studio/curriculum/?tab=modules",{scroll:false}); router.push("/learn/");
assert.deepEqual(calls.slice(3), [["push","/courses/",undefined],["replace-next","/curriculum/?tab=modules",{scroll:false}],["assign",ORIGINS.app+"/learn/"]]);
// A cached root document must recover even before the edge redirect is updated.
for (const pathname of ["/", "/studio/"]) {
  const redirects = [];
  const guard = loadSource(new URL("../src/components/RouteGuard.tsx", import.meta.url), {
    react:{useEffect:fn=>fn()}, "next/navigation":{usePathname:()=>pathname},
  }, {window:{location:{hostname:"studio.yaqeenguide.com",origin:ORIGINS.studio,search:"?tab=review",hash:"#filters",replace:url=>redirects.push(url)}}});
  guard.RouteGuard();
  assert.deepEqual(redirects,[ORIGINS.studio+"/courses/?tab=review#filters"]);
}
const replies = [];
let receive;
// Use the actual parent identity: sibling frames cannot request session information.
const bridgeParent = { postMessage:(data,origin)=>replies.push({data,origin}) };
const bridge = loadSource(new URL("../src/features/auth/studio-session.ts", import.meta.url), {}, { ...globals, window:{
  location:{origin:ORIGINS.app},parent:bridgeParent,addEventListener:(_event,handler)=>{receive=handler;},removeEventListener:()=>{},
} });
const message = {origin:ORIGINS.studio,source:bridgeParent,data:{channel:"yaqeen-studio-auth-v1",id:"fixture",action:"session"}};
assert(bridge.trustedBridgeMessage(message));
for (const change of [{origin:ORIGINS.site},{origin:"https://evil.test"},{source:{}},{data:{...message.data,action:"delete"}},{data:{...message.data,channel:"other"}}]) assert(!bridge.trustedBridgeMessage({...message,...change}));
let session = { access_token:"private-access",refresh_token:"private-refresh",user:{is_anonymous:false} }, error = null, signouts = 0;
bridge.serveStudioSession({auth:{getSession:async()=>({data:{session},error}),signOut:async()=>{signouts++;return {};}}});
for (const origin of [ORIGINS.site,"https://yaqeenguide.com"]) {
  const status = {...message,origin,data:{...message.data,action:"status"}};
  assert(bridge.trustedBridgeMessage(status));
  await receive(status);
  const reply = replies.at(-1);
  assert.equal(reply.origin,origin);
  assert.equal(reply.data.signedIn,true);
  assert.deepEqual(Object.keys(reply.data).sort(),["channel","id","signedIn"],"Public site never receives tokens or user data");
  for (const action of ["session","signout"]) {
    const count = replies.length;
    await receive({...status,data:{...status.data,action}});
    assert.equal(replies.length,count);
    assert.equal(signouts,0);
  }
}
const status = {...message,origin:ORIGINS.site,data:{...message.data,action:"status"}};
session.user.is_anonymous = true;
await receive(status);
assert.equal(replies.at(-1).data.signedIn,false);
session = null;
await receive(status);
assert.equal(replies.at(-1).data.signedIn,false);
error = new Error("Unavailable");
await receive(status);
assert(replies.at(-1).data.error);
console.log(`PASS ${Object.keys(routes).length} classified pages/aliases, frontend navigation, safe auth returns and restricted Studio/public-site bridge messages.`);
