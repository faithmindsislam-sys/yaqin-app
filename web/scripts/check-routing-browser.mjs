// Real exported app and Supabase SDK, with all network traffic intercepted locally.
// No account is created, email sent, or live user signed out.
import "./load-env.mjs";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { runInNewContext } from "node:vm";
import { chromium } from "playwright";

const exported = resolve(process.env.ROUTING_EXPORT || ".next-routing");
assert(existsSync(resolve(exported, "learn/index.html")), "Build the export before running this check");
const edge = {};
runInNewContext(readFileSync("../infra/cloudfront/index-rewrite.js", "utf8"), edge);
const bridgePolicy = JSON.parse(readFileSync("../infra/cloudfront/auth-bridge-headers.json", "utf8"));
assert(bridgePolicy.RemoveHeadersConfig.Items.some(item => item.Header.toLowerCase() === "x-frame-options"));
const SITE = "https://www.yaqeenguide.com", APP = "https://app.yaqeenguide.com", STUDIO = "https://studio.yaqeenguide.com";
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert(sbUrl, "NEXT_PUBLIC_SUPABASE_URL must match the export");
const uid = "00000000-0000-0000-0000-000000000001";
const user = {id:uid,email:"routing@example.test",role:"authenticated",aud:"authenticated",created_at:"2026-10-01T00:00:00Z",user_metadata:{name:"Routing fixture"},app_metadata:{providers:["email"]}};
const exp = Math.floor(Date.now()/1000)+3600;
const token = [Buffer.from(JSON.stringify({alg:"HS256",typ:"JWT"})).toString("base64url"),Buffer.from(JSON.stringify({sub:uid,exp,aud:"authenticated",role:"authenticated"})).toString("base64url"),"fixture"].join(".");
const session = {access_token:token,refresh_token:"fixture-refresh",expires_at:exp,expires_in:3600,token_type:"bearer",user};
const content = JSON.parse(readFileSync(resolve(exported,"data/content.json"),"utf8"));
const MIME = {".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".txt":"text/plain",".png":"image/png",".webp":"image/webp",".woff2":"font/woff2",".mp3":"audio/mpeg"};
const browser = await chromium.launch({headless:true,...(process.env.COURSE_CHROME_PATH ? {executablePath:process.env.COURSE_CHROME_PATH} : {})});
const output = process.env.ROUTING_SCREENSHOTS || "/tmp/yaqeen-routing-check";
mkdirSync(output,{recursive:true});
let active;
async function setup() {
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
  const state = {requests:[],failLogout:false,failLogin:false,failContent:false,failSnapshot:false};
  await context.route("**/*", async (route) => {
    const req = route.request(), url = new URL(req.url());
    const send = (json,status=200) => route.fulfill({status,json,headers:{"access-control-allow-origin":"*","access-control-allow-headers":"*","access-control-allow-methods":"GET,POST,PUT,PATCH,DELETE,OPTIONS"}});
    if (req.method()==="OPTIONS") return send({});
    if (url.origin===new URL(sbUrl).origin) {
      state.requests.push({path:url.pathname,query:Object.fromEntries(url.searchParams),body:req.postDataJSON?.()});
      if (url.pathname.endsWith("/authorize")) {
        const callback = new URL(url.searchParams.get("redirect_to"));
        callback.hash = new URLSearchParams({access_token:token,refresh_token:"fixture-refresh",token_type:"bearer",expires_in:"3600",type:"signup"}).toString();
        return route.fulfill({status:200,contentType:"text/html",body:`<script>location.replace(${JSON.stringify(callback.href)})</script>`});
      }
      if (url.pathname.endsWith("/token")) return send(state.failLogin ? {code:"invalid_credentials",message:"Invalid login credentials"} : session,state.failLogin?400:200);
      if (url.pathname.endsWith("/signup")) return send({user,session:null});
      if (url.pathname.endsWith("/recover") || url.pathname.endsWith("/resend")) return send({});
      if (url.pathname.endsWith("/logout")) return send(state.failLogout?{message:"Sign-out unavailable"}:{},state.failLogout?400:200);
      if (url.pathname.endsWith("/user")) return send(user);
      if (url.pathname.includes("/profiles")) return send({id:uid,role:"admin",preferred_track:"first-steps",daily_minutes:10,onboarded:true,known_lessons:[],lang:"en",display_name:"Routing fixture"});
      return send([]);
    }
    if (![SITE,APP,STUDIO,"https://www.yaqeenguide.com"].includes(url.origin)) throw new Error("Unexpected external request: "+url.origin+url.pathname);
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname==="/api/content") return send(state.failContent ? {error:{message:"Content unavailable"}} : content,state.failContent?503:200);
      if (url.pathname==="/api/review/courses") return send(Object.values(content.courses));
      if (url.pathname==="/api/curriculum") return send({...content,courses:Object.values(content.courses),updated_at:{subjects:null,levels:null,tracks:null}});
      if (url.pathname.includes("/admin/rag/resources")) return send({resources:[],total:0,page:1,pageSize:25});
      return send([]);
    }
    if (url.pathname==="/data/content.json" && state.failSnapshot) return send({},503);
    const headers = Object.fromEntries(Object.entries(req.headers()).map(([key,value])=>[key,{value}]));
    headers.host={value:url.hostname};
    const result=edge.handler({request:{method:req.method(),uri:url.pathname,querystring:Object.fromEntries([...url.searchParams].map(([key,value])=>[key,{value}])),headers}});
    if (req.isNavigationRequest() && process.env.ROUTING_DEBUG) console.log("DOCUMENT",url.href,result.statusCode || result.uri,result.headers?.location?.value || "");
    // Playwright only intercepts the first request in an HTTP redirect chain.
    // Trigger a new document request so the entire browser check stays mocked;
    // actual 308 status/location semantics are asserted by check-index-rewrite.mjs.
    if (result.statusCode) return route.fulfill({status:200,contentType:"text/html",body:`<script>location.replace(${JSON.stringify(result.headers.location.value)}+location.hash)</script>`});
    const file = resolve(exported,"."+result.uri);
    assert(file.startsWith(exported+sep));
    if (!existsSync(file) && process.env.ROUTING_DEBUG) console.error("MISSING",file);
    if (!existsSync(file)) return route.fulfill({status:404,contentType:"text/plain",body:"Missing fixture file: "+result.uri});
    return route.fulfill({status:200,headers:result.uri.startsWith("/auth/bridge/") ? {"content-security-policy":bridgePolicy.SecurityHeadersConfig.ContentSecurityPolicy.ContentSecurityPolicy} : {"x-frame-options":"SAMEORIGIN"},contentType:MIME[extname(file)]||"application/octet-stream",body:readFileSync(file)});
  });
  const page=await context.newPage();
  const errors=[];page.on("pageerror",e=>{errors.push(e.message);if(process.env.ROUTING_DEBUG)console.error("PAGE ERROR",e.message);});
  active=page;
  return {context,page,state,errors};
}
async function passwordLogin(page, next="") {
  await page.goto(APP+"/signin/"+(next?"?next="+encodeURIComponent(next):""));
  await page.getByRole("textbox",{name:"Email address",exact:true}).fill(user.email);
  await page.getByLabel("Password",{exact:true}).fill("fixture-password");
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
}
async function studioFilters(page) {
  const select = label=>page.getByRole("combobox",{name:new RegExp("^"+label+" ")});
  for (const [label, items] of [["Journey",content.tracks],["Subject",content.subjects],["Difficulty level",content.levels]]) {
    await select(label).click();
    for (const item of items) await page.getByRole("option",{name:item.title.en,exact:true}).waitFor();
    await select(label).press("Escape");
  }
  const course = Object.values(content.courses).find(course=>course.status==="published");
  const track = content.tracks.find(track=>track.id===course.tracks[0]);
  await select("Journey").click();
  await page.getByRole("option",{name:track.title.en,exact:true}).click();
  await select("Module").click();
  for (const section of track.modules) await page.getByRole("option",{name:section.title.en,exact:true}).waitFor();
  await select("Module").press("Escape");
  await page.getByRole("searchbox",{name:"Search by title",exact:true}).fill(course.title.en);
  const row = page.locator("tbody tr").filter({has:page.getByRole("link",{name:course.title.en,exact:true})});
  for (const title of [track.title.en,content.subjects.find(subject=>subject.id===course.subject).title.en,content.levels.find(level=>level.id===course.level).title.en]) await row.getByText(title,{exact:true}).waitFor();
  assert.equal(await page.getByText("Loading courses…",{exact:true}).count(),0);
  assert.equal(await page.getByRole("link",{name:"Courses",exact:true}).first().getAttribute("aria-current"),"page");
  await page.getByRole("button",{name:"Reset filters",exact:true}).click();
}
try {
  const f=await setup(), {page,state}=f;
  await page.goto(SITE+"/");
  assert.equal(await page.getByRole("link",{name:"Sign in",exact:true}).first().getAttribute("href"),APP+"/signin/");
  await page.getByRole("link",{name:"Sign in",exact:true}).first().click();
  await page.waitForURL(APP+"/signin/");
  assert.equal(await page.getByRole("link",{name:"Home",exact:true}).getAttribute("href"),SITE+"/");
  assert.equal(await page.getByRole("link",{name:"Privacy",exact:true}).getAttribute("href"),SITE+"/privacy/");
  await page.getByRole("textbox",{name:"Email address",exact:true}).fill(user.email);
  await page.getByLabel("Password",{exact:true}).fill("fixture-password");
  state.failLogin=true;
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await page.getByRole("alert").filter({hasText:"Invalid login credentials"}).waitFor();
  assert.equal(page.url(),APP+"/signin/");
  state.failLogin=false;
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await page.waitForURL(APP+"/learn/");
  // The public header reads the app session across origins without importing it.
  await page.goto(SITE+"/");
  await page.getByRole("link",{name:"Dashboard",exact:true}).waitFor();
  assert.equal(await page.getByRole("link",{name:"Dashboard",exact:true}).getAttribute("href"),APP+"/learn/");
  assert.equal(await page.getByRole("link",{name:"Sign in",exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith("sb-")&&key.endsWith("-auth-token")).length),0,"Session tokens stay on the app origin");
  await page.getByRole("button",{name:"العربية",exact:true}).first().click();
  await page.getByRole("link",{name:"لوحتي",exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});
  await page.locator(".mobile-menu summary").click();
  assert.equal(await page.getByRole("link",{name:"تسجيل الدخول",exact:true}).count(),0);
  await page.getByRole("button",{name:"EN",exact:true}).first().click();
  await page.screenshot({path:output+"/signed-in-site-mobile.png"});
  await page.setViewportSize({width:1440,height:1000});
  await page.reload();
  await page.getByRole("link",{name:"Dashboard",exact:true}).waitFor();
  await page.screenshot({path:output+"/signed-in-site.png"});
  await page.getByRole("link",{name:"Dashboard",exact:true}).click();
  await page.waitForURL(APP+"/learn/");
  await page.getByRole("link",{name:"Studio",exact:true}).first().click();
  await page.waitForURL(STUDIO+"/courses/");
  await page.getByRole("link",{name:"New course",exact:true}).waitFor();
  assert(!page.url().includes("/studio/"));
  // Legacy Studio roots redirect to the course list, whose metadata must load.
  await page.goto(STUDIO+"/?from=legacy#filters");
  await page.waitForURL(STUDIO+"/courses/?from=legacy#filters");
  await page.reload();
  await studioFilters(page);
  state.failContent=true;
  await page.reload();
  await page.getByRole("status").filter({hasText:"Live courses are unavailable. Showing saved content."}).waitFor();
  await studioFilters(page);
  state.failSnapshot=true;
  await page.reload();
  await page.getByRole("status").filter({hasText:"Courses are currently unavailable. Please try again."}).waitFor();
  state.failContent=false;
  // Dispatch directly so automatic window-focus refresh cannot race this retry.
  await page.getByRole("button",{name:"Retry",exact:true}).dispatchEvent("click");
  await studioFilters(page);
  assert.equal(await page.getByText("Courses are currently unavailable. Please try again.",{exact:true}).count(),0);
  state.failSnapshot=false;
  await page.screenshot({path:output+"/studio-root.png"});
  await page.getByRole("link",{name:"New course",exact:true}).click();
  await page.waitForURL(STUDIO+"/editor/");
  await page.reload();
  await page.getByRole("link",{name:"Back to app",exact:true}).first().click();
  await page.waitForURL(APP+"/learn/");
  await page.goto(APP+"/app/learn/?track=first-steps");
  await page.waitForURL(APP+"/learn/?track=first-steps");
  await page.goto(APP+"/studio/curriculum/?tab=subjects");
  await page.waitForURL(STUDIO+"/curriculum/?tab=subjects");
  await page.getByRole("link",{name:"Courses",exact:true}).first().click();
  await page.waitForURL(STUDIO+"/courses/");
  await studioFilters(page);
  await page.getByRole("link",{name:"Back to app",exact:true}).first().click();
  await page.waitForURL(APP+"/learn/");
  const siteTab = await f.context.newPage();
  await siteTab.goto(SITE+"/privacy/");
  await siteTab.getByRole("link",{name:"Dashboard",exact:true}).waitFor();
  state.failLogout=true;
  await page.getByRole("button",{name:"Sign out",exact:true}).first().click();
  await page.getByRole("alert").filter({hasText:"Sign-out failed"}).waitFor();
  assert.equal(page.url(),APP+"/learn/");
  state.failLogout=false;
  await page.getByRole("button",{name:"Sign out",exact:true}).first().click();
  await page.waitForURL(SITE+"/");
  await page.getByRole("link",{name:"Sign in",exact:true}).first().waitFor();
  await siteTab.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await siteTab.getByRole("link",{name:"Start your journey",exact:true}).waitFor();
  assert.equal(await siteTab.getByRole("link",{name:"Dashboard",exact:true}).count(),0);
  await siteTab.close();
  await page.goto(STUDIO+"/");
  await page.waitForURL(url=>url.origin===APP&&url.pathname==="/signin/");
  assert.equal(new URL(page.url()).searchParams.get("next"),"/courses/");
  // Studio can no longer reuse its previous local session after app logout.
  await page.goto(STUDIO+"/editor/?part=questions");
  await page.waitForURL(url=>url.origin===APP&&url.pathname==="/signin/");
  assert.equal(new URL(page.url()).searchParams.get("next"),"/editor/?part=questions");
  await page.getByRole("button",{name:"Continue with Google",exact:true}).click();
  await page.waitForURL(STUDIO+"/editor/?part=questions");
  const google=state.requests.find(r=>r.path.endsWith("/authorize"));
  assert.equal(google.query.provider,"google");
  assert.equal(new URL(google.query.redirect_to).origin,APP);
  assert.equal(new URL(google.query.redirect_to).pathname,"/auth/callback/");
  assert.equal(new URL(google.query.redirect_to).searchParams.get("next"),"/editor/?part=questions");
  state.failLogout=true;
  await page.getByRole("button",{name:"Sign out",exact:true}).first().click();
  await page.getByRole("alert").filter({hasText:"Sign-out failed"}).waitFor();
  await page.reload();
  await page.getByRole("link",{name:"Back to app",exact:true}).first().waitFor();
  assert.equal(page.url(),STUDIO+"/editor/?part=questions");
  state.failLogout=false;
  await page.getByRole("button",{name:"Sign out",exact:true}).first().click();
  await page.waitForURL(SITE+"/");
  await page.goto(APP+"/reset-password/?error_description=Reset%20link%20expired");
  await page.getByRole("alert").filter({hasText:"Reset link expired"}).waitFor();
  assert(await page.getByRole("button",{name:"Update password",exact:true}).isDisabled());
  await page.goto(APP+"/signin/");
  await page.getByRole("textbox",{name:"Email address",exact:true}).fill(user.email);
  await page.getByRole("button",{name:"Forgot password?",exact:true}).click();
  await page.getByRole("status").filter({hasText:"reset"}).waitFor();
  const recover=state.requests.find(r=>r.path.endsWith("/recover"));
  assert.equal(recover.query.redirect_to,APP+"/reset-password/");
  await page.getByRole("button",{name:"Create account",exact:true}).click();
  await page.getByRole("textbox",{name:"Your name",exact:true}).fill("Routing fixture");
  await page.getByLabel("Password",{exact:true}).fill("fixture-password");
  await page.getByRole("button",{name:"Create account",exact:true}).first().click();
  await page.getByRole("button",{name:"Resend confirmation email",exact:true}).waitFor();
  const signup=state.requests.find(r=>r.path.endsWith("/signup"));
  assert.equal(signup.query.redirect_to,APP+"/auth/callback/");
  await page.getByRole("button",{name:"Resend confirmation email",exact:true}).click();
  await page.getByRole("status").filter({hasText:"email"}).waitFor();
  const resend=state.requests.find(r=>r.path.endsWith("/resend"));
  assert.equal(resend.query.redirect_to,APP+"/auth/callback/");
  await passwordLogin(page,"/settings/");
  await page.waitForURL(APP+"/settings/");
  await page.goto(APP+"/signin/?next="+encodeURIComponent("//evil.test/"));
  await page.waitForURL(APP+"/learn/");
  await page.goto(APP+"/auth/callback/?error_code=user_banned&error_description=User%20banned");
  await page.getByRole("heading",{name:"Account disabled",exact:true}).waitFor();
  await page.goto(APP+"/reset-password/");
  await page.getByLabel("New password",{exact:true}).fill("new-fixture-password");
  await page.getByLabel("Confirm password",{exact:true}).fill("new-fixture-password");
  await page.getByRole("button",{name:"Update password",exact:true}).click();
  await page.getByText("Your password has been updated.",{exact:true}).waitFor();
  assert(state.requests.some(r=>r.path.endsWith("/user")&&r.body?.password==="new-fixture-password"));
  await page.getByRole("link",{name:"Continue",exact:true}).click();
  await page.waitForURL(APP+"/learn/");
  assert.deepEqual(f.errors,[]);
  console.log("PASS real-browser routing/auth: signed-in public header in EN/AR and mobile, cross-tab logout, tokens remain app-local, public login links, password failure/success, Google callback/return path, Studio SSO, root redirect, course metadata/filters after refresh, saved-catalog fallback and retry, legacy redirects, app/Studio logout, logout failure, signup/resend and reset destinations.");
  await f.context.close();
} catch(error) {
  if(active) { await active.screenshot({path:output+"/failure.png"}).catch(()=>{}); console.error("Failed at "+active.url()); }
  throw error;
} finally {await browser.close();}
