function cleanHost(hostname) {
  if (!hostname) return "";
  var host = String(hostname).toLowerCase();
  if (host.indexOf("www.") === 0) host = host.substring(4);
  if (!/^[a-z0-9.-]+$/.test(host)) return "";
  if (host.length > 253 || host.indexOf("..") >= 0) return "";
  return host;
}

function hostFromUrl(url) {
  try {
    var parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return cleanHost(parsed.hostname);
  } catch (e) {
    return "";
  }
}

function absoluteUrl(text) {
  var raw = String(text || "").replace(/^\s+|\s+$/g, "");
  if (!raw || raw.length > 2000) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = "https://" + raw;
  try {
    var parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    if (!cleanHost(parsed.hostname)) return "";
    return parsed.href;
  } catch (e) {
    return "";
  }
}

function hostMatches(host, site) {
  if (!host || !site || host === site) return host === site && !!host;
  var suffix = "." + site;
  return host.length > suffix.length && host.substring(host.length - suffix.length) === suffix;
}

function rulesFor(host, sites) {
  var found = [];
  var i;
  host = cleanHost(host);
  if (!host || !sites) return found;
  for (i = 0; i < sites.length; i++) {
    var site = cleanHost(sites[i]);
    if (site && hostMatches(host, site) && found.indexOf(site) < 0) found.push(site);
  }
  found.sort(function (a, b) { return a.length - b.length; });
  return found;
}

var VK_HOSTS = [
  "vk.com",
  "vk.ru",
  "vk.me",
  "userapi.com",
  "vkuserphoto.ru",
  "vkuser.net",
  "vkuservideo.ru",
  "vkuservideo.net",
  "vkuseraudio.ru",
  "vkuseraudio.net",
  "vkuserlive.net",
  "okcdn.ru",
  "mycdn.me"
];

function isVkHost(host) {
  var i;
  for (i = 0; i < VK_HOSTS.length; i++) {
    if (host === VK_HOSTS[i] || hostMatches(host, VK_HOSTS[i])) return true;
  }
  return false;
}

var PORTAL = {
  "mail.ru": 1,
  "yandex.ru": 1,
  "ya.ru": 1,
  "ok.ru": 1,
  "rambler.ru": 1,
  "avito.ru": 1,
  "ozon.ru": 1,
  "wildberries.ru": 1,
  "google.com": 1,
  "youtube.com": 1,
  "gstatic.com": 1,
  "googleapis.com": 1,
  "github.com": 1,
  "microsoft.com": 1,
  "live.com": 1,
  "apple.com": 1
};

function publicSuffix(host) {
  host = cleanHost(host);
  if (!host) return "";
  var parts = host.split(".");
  var i;
  for (i = 0; i < parts.length; i++) {
    var rest = parts.slice(i).join(".");
    if (SUFFIX_EXCEPT[rest]) return parts.slice(i + 1).join(".") || rest;
    if (SUFFIX_EXACT[rest]) return rest;
    if (i > 0 && SUFFIX_WILD[rest]) return parts.slice(i - 1).join(".");
  }
  return parts[parts.length - 1];
}

function registrableDomain(host) {
  host = cleanHost(host);
  if (!host) return "";
  var suffix = publicSuffix(host);
  if (!suffix || host === suffix) return host;
  var parts = host.split(".");
  var count = suffix.split(".").length;
  if (parts.length <= count) return host;
  return parts.slice(parts.length - count - 1).join(".");
}

function canonicalSite(host) {
  host = cleanHost(host);
  if (!host) return "";
  if (isVkHost(host)) return "vk.com";
  return registrableDomain(host) || host;
}

function widen(host) {
  host = cleanHost(host);
  if (!host) return "";
  var labels = host.split(".");
  while (labels.length > 2 && /[0-9]/.test(labels[0])) {
    var parent = labels.slice(1).join(".");
    if (PORTAL[parent] || publicSuffix(parent) === parent) break;
    labels = labels.slice(1);
    host = parent;
  }
  if (!host || publicSuffix(host) === host) return "";
  return host;
}

function relatedHosts(host) {
  host = cleanHost(host);
  if (!host) return [];
  if (isVkHost(host)) return VK_HOSTS.slice();
  return [host];
}

function siteCovers(host, sites) {
  var key = canonicalSite(host);
  if (!key || !sites) return false;
  var i;
  for (i = 0; i < sites.length; i++) {
    if (canonicalSite(sites[i]) === key) return true;
  }
  return false;
}

function addHost(out, name) {
  name = cleanHost(name);
  if (name && out.indexOf(name) < 0) out.push(name);
}

function expandSites(sites, links) {
  var out = [];
  var i;
  var j;
  for (i = 0; i < (sites || []).length; i++) {
    var names = relatedHosts(sites[i]);
    for (j = 0; j < names.length; j++) addHost(out, names[j]);
    var key = canonicalSite(sites[i]);
    addHost(out, key);
    var extra = links && key && links[key];
    if (!extra) continue;
    for (j = 0; j < extra.length; j++) addHost(out, extra[j]);
  }
  return out;
}

function nextSites(sites, url) {
  var host = hostFromUrl(url || "");
  var list = sites || [];
  if (!host) return list.slice();
  var key = canonicalSite(host);
  var has = false;
  var next = [];
  var i;
  for (i = 0; i < list.length; i++) {
    if (canonicalSite(list[i]) === key) has = true;
    else next.push(list[i]);
  }
  if (!has) next.push(key);
  return next;
}

function describeTab(url, status) {
  var host = hostFromUrl(url || "");
  var online = !!(status && status.online);
  var sites = status && status.sites ? status.sites : [];
  var rules = host ? rulesFor(host, sites) : [];
  var chromeDirect = !!(status && status.chrome);
  return {
    host: host,
    online: online,
    chrome: chromeDirect,
    rules: rules,
    rule: rules.length ? rules[0] : "",
    direct: online && (chromeDirect || rules.length > 0)
  };
}

function buildPac(hosts, port) {
  var safe = [];
  var i;
  for (i = 0; i < hosts.length; i++) {
    var host = cleanHost(hosts[i]);
    if (host && safe.indexOf(host) < 0) safe.push(host);
  }
  var proxyPort = parseInt(port, 10);
  if (!(proxyPort > 0 && proxyPort < 65536)) proxyPort = 10801;
  return [
    "function FindProxyForURL(url, host) {",
    "  host = host.toLowerCase();",
    "  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return 'DIRECT';",
    "  if (host.length > 6 && host.substring(host.length - 6) === '.local') return 'DIRECT';",
    "  if (/^(10\\.|127\\.|192\\.168\\.|172\\.(1[6-9]|2\\d|3[0-1])\\.)/.test(host)) return 'DIRECT';",
    "  var list = " + JSON.stringify(safe) + ";",
    "  var i;",
    "  for (i = 0; i < list.length; i++) {",
    "    if (dnsDomainIs(host, list[i])) return 'DIRECT';",
    "  }",
    "  return 'PROXY 127.0.0.1:" + proxyPort + "';",
    "}"
  ].join("\n");
}
