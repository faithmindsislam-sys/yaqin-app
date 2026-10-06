// CloudFront viewer-request function yaqin-index-rewrite, default behavior E2Z664SCKULGHC.
// ROUTES is generated from web/src/lib/routes.json by web/scripts/sync-edge-routes.mjs.
var ORIGINS = {site:'https://www.yaqeenguide.com',app:'https://app.yaqeenguide.com',studio:'https://studio.yaqeenguide.com'};
// BEGIN ROUTES
var ROUTES = {"/":["site","/"],"/privacy/":["site","/privacy/"],"/teachers/":["site","/teachers/"],"/articles/":["site","/articles/"],"/articles/how-to-perform-wudu/":["site","/articles/how-to-perform-wudu/"],"/articles/what-is-zakat/":["site","/articles/what-is-zakat/"],"/journey/":["app","/journey/"],"/learn/":["app","/learn/"],"/settings/":["app","/settings/"],"/signin/":["app","/signin/"],"/reset-password/":["app","/reset-password/"],"/auth/callback/":["app","/auth/callback/"],"/auth/bridge/":["app","/auth/bridge/"],"/start/":["app","/start/"],"/start/explore/":["app","/start/explore/"],"/library/":["app","/library/"],"/course/":["app","/course/"],"/lesson/":["app","/lesson/"],"/quran/":["app","/quran/"],"/compare/":["app","/compare/"],"/ask/":["app","/ask/"],"/shahada/":["app","/shahada/"],"/first-steps/":["app","/first-steps/"],"/worship/":["app","/worship/"],"/app/":["app","/journey/"],"/app/learn/":["app","/learn/"],"/app/settings/":["app","/settings/"],"/studio/":["studio","/courses/"],"/courses/":["studio","/courses/"],"/studio/course/":["studio","/editor/"],"/editor/":["studio","/editor/"],"/studio/lesson/":["studio","/editor/"],"/studio/curriculum/":["studio","/curriculum/"],"/curriculum/":["studio","/curriculum/"],"/studio/users/":["studio","/users/"],"/users/":["studio","/users/"],"/studio/knowledge-base/":["studio","/knowledge-base/"],"/knowledge-base/":["studio","/knowledge-base/"],"/studio/sources/":["studio","/sources/"],"/sources/":["studio","/sources/"],"/instructor/":["studio","/courses/"]};
// END ROUTES
var ASSETS = ['/_next/', '/data/', '/resources/', '/img/', '/audio/', '/avatars/', '/api/', '/.well-known/oauth-protected-resource/'];

function query(qs) {
  var parts = [];
  for (var key in qs) {
    var v = qs[key];
    var values = v.multiValue ? v.multiValue.map(function (m) { return m.value; }) : [v.value];
    values.forEach(function (value) { parts.push(encodeURIComponent(key) + (value === '' ? '' : '=' + encodeURIComponent(value))); });
  }
  return parts.length ? '?' + parts.join('&') : '';
}
function moved(location) {
  return {statusCode:308,statusDescription:'Permanent Redirect',headers:{location:{value:location},'cache-control':{value:'no-store'}}};
}
function pagePath(uri) {
  for (var i = 0; i < ASSETS.length; i++) if (uri.indexOf(ASSETS[i]) === 0) return null;
  uri = uri.toLowerCase().replace(/\/+/g, '/');
  if (/\/index\.html$/.test(uri)) uri = uri.replace(/index\.html$/, '');
  else if (/\.html$/.test(uri)) uri = uri.replace(/\.html$/, '/');
  else if (uri.split('/').pop().indexOf('.') !== -1) return null;
  return uri.endsWith('/') ? uri : uri + '/';
}
// Background RSC, prefetch, and HEAD requests never redirect across origins.
function isNavigation(req) {
  var h = req.headers;
  if (req.method !== 'GET' || h.rsc || h['next-router-prefetch']) return false;
  if (h['sec-fetch-mode']) return h['sec-fetch-mode'].value === 'navigate';
  return !h.accept || h.accept.value.indexOf('text/html') !== -1;
}
function handler(event) {
  var req = event.request;
  var host = (req.headers.host && req.headers.host.value || '').toLowerCase();
  var uri = req.uri;
  // Dedicated API hostname never serves the static website.
  if (host === 'public-api.yaqeenguide.com') {
    // Claude removes the final slash; rewrite internally so OAuth discovery still reaches MCP.
    if (uri === '/api/v1/mcp') req.uri = uri + '/';
    if (uri.indexOf('/api/v1/') === 0 || uri === '/.well-known/oauth-protected-resource/api/v1/mcp/') return req;
    if (uri === '/' && (req.method === 'GET' || req.method === 'HEAD')) return moved('https://public-api.yaqeenguide.com/api/v1/docs');
    return {statusCode:404,statusDescription:'Not Found',headers:{'cache-control':{value:'no-store'},'content-type':{value:'application/json'}},body:'{"error":{"code":"not_found","message":"API route not found."}}'};
  }
  for (var a = 0; a < ASSETS.length; a++) if (uri.indexOf(ASSETS[a]) === 0) return req;
  var managed = host === 'yaqeenguide.com' || host === 'www.yaqeenguide.com' || host === 'app.yaqeenguide.com' || host === 'studio.yaqeenguide.com' || host === 'd1x2w48x0bzbrs.cloudfront.net';
  var path = pagePath(uri);
  var route = path && ROUTES[path];
  if (managed && path === '/') {
    if (host === 'studio.yaqeenguide.com') route = ['studio', '/courses/'];
    else if (host === 'app.yaqeenguide.com') route = ['app', '/learn/'];
  }
  if (managed && route && isNavigation(req)) {
    var target = ORIGINS[route[0]] + route[1];
    if ('https://' + host + uri !== target) return moved(target + query(req.querystring));
  }
  // Background requests for the legacy root use the same course-list document.
  if (host === 'studio.yaqeenguide.com' && (uri === '/' || uri === '/index.html')) uri = '/courses/';
  if (host === 'studio.yaqeenguide.com' && (uri === '/index.txt' || uri.indexOf('/__next.') === 0)) uri = '/courses' + uri;
  if (uri.endsWith('/')) req.uri = uri + 'index.html';
  else if (uri.split('/').pop().indexOf('.') === -1) req.uri = uri + '/index.html';
  else req.uri = uri;
  return req;
}
