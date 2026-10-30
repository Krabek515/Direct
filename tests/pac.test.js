const fs = require("fs");
const path = require("path");
const vm = require("vm");

const suffix = fs.readFileSync(path.join(__dirname, "..", "extension", "suffixes.js"), "utf8");
const source = fs.readFileSync(path.join(__dirname, "..", "extension", "pac.js"), "utf8");
const sandbox = { URL, JSON, parseInt, String };
vm.runInNewContext(suffix + "\n" + source, sandbox);

function dnsDomainIs(host, domain) {
  return host === domain || host.endsWith("." + domain);
}

function decide(hosts, port, url, host) {
  const pac = sandbox.buildPac(hosts, port);
  const context = { dnsDomainIs };
  vm.runInNewContext(pac + "\nthis.result = FindProxyForURL(" + JSON.stringify(url) + ", " + JSON.stringify(host) + ");", context);
  return context.result;
}

const checks = [
  [["youtube.com"], 10801, "https://youtube.com/", "youtube.com", "DIRECT"],
  [["youtube.com"], 10801, "https://www.youtube.com/", "www.youtube.com", "DIRECT"],
  [["youtube.com"], 10801, "https://music.youtube.com/", "music.youtube.com", "DIRECT"],
  [["youtube.com"], 10801, "https://google.com/", "google.com", "PROXY 127.0.0.1:10801"],
  [[], 10801, "http://127.0.0.1:8080/", "127.0.0.1", "DIRECT"],
  [[], 10801, "http://192.168.1.1/", "192.168.1.1", "DIRECT"],
  [["example.com"], 99999, "https://example.org/", "example.org", "PROXY 127.0.0.1:10801"],
  [["bad host"], 10801, "https://example.org/", "example.org", "PROXY 127.0.0.1:10801"]
];

let failed = 0;
for (const [hosts, port, url, host, expected] of checks) {
  const actual = decide(hosts, port, url, host);
  if (actual !== expected) {
    failed++;
    console.error("FAIL", host, "expected", expected, "got", actual);
  }
}

const cleaned = sandbox.hostFromUrl("https://www.Example.com/path");
if (cleaned !== "example.com") {
  failed++;
  console.error("FAIL host", cleaned);
}
if (sandbox.hostFromUrl("chrome://extensions") !== "") {
  failed++;
  console.error("FAIL chrome url");
}
same(sandbox.absoluteUrl("console.rustore.ru/apps"), "https://console.rustore.ru/apps", "bare link");
same(sandbox.absoluteUrl("  https://VK.com/im "), "https://vk.com/im", "trimmed url");
same(sandbox.absoluteUrl("chrome://extensions"), "", "not a site");
same(sandbox.absoluteUrl(""), "", "empty link");

function same(actual, expected, label) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) {
    failed++;
    console.error("FAIL", label, "expected", right, "got", left);
  }
}

same(sandbox.rulesFor("music.youtube.com", ["youtube.com"]), ["youtube.com"], "parent rule");
same(sandbox.rulesFor("www.youtube.com", ["youtube.com"]), ["youtube.com"], "www stripped before match");
same(sandbox.rulesFor("youtube.com", ["youtube.com", "music.youtube.com"]), ["youtube.com"], "shortest first");
same(sandbox.rulesFor("music.youtube.com", ["youtube.com", "music.youtube.com"]), ["youtube.com", "music.youtube.com"], "both covers");
same(sandbox.rulesFor("notgoogle.com", ["google.com"]), [], "no suffix collision");
same(sandbox.describeTab("https://www.youtube.com/feed", { online: true, chrome: false, sites: ["youtube.com"] }), {
  host: "youtube.com",
  online: true,
  chrome: false,
  rules: ["youtube.com"],
  rule: "youtube.com",
  direct: true
}, "www tab is direct");
same(sandbox.describeTab("https://example.com/", { online: true, chrome: false, sites: ["youtube.com"] }), {
  host: "example.com",
  online: true,
  chrome: false,
  rules: [],
  rule: "",
  direct: false
}, "other site stays on the proxy");
same(sandbox.describeTab("chrome://newtab", { online: true, chrome: false, sites: [] }).direct, false, "internal page");
same(sandbox.describeTab("https://example.com/", { online: false, chrome: false, sites: ["example.com"] }).direct, false, "offline does not claim direct");
same(sandbox.relatedHosts("vk.ru").indexOf("vkuserphoto.ru") >= 0, true, "vk photo is related");
same(sandbox.expandSites(["vk.com"]).indexOf("vkuseraudio.ru") >= 0, true, "vk audio expands");
same(sandbox.expandSites(["vk.com"]).indexOf("okcdn.ru") >= 0, true, "vk video expands");
same(sandbox.siteCovers("vk.ru", ["vk.com"]), true, "vk.ru follows vk.com");
same(sandbox.siteCovers("sun4-9.vkuserphoto.ru", ["vk.com"]), true, "photo host follows vk");
same(sandbox.siteCovers("psv4.vkuseraudio.ru", ["vk.com"]), true, "audio host follows vk");
same(sandbox.siteCovers("example.com", ["vk.com"]), false, "vk does not cover other sites");
same(sandbox.registrableDomain("console.rustore.ru"), "rustore.ru", "rustore site");
same(sandbox.registrableDomain("foo.github.io"), "foo.github.io", "github pages stay separate");
same(sandbox.canonicalSite("api.rustore.ru"), "rustore.ru", "api belongs to the site");
same(sandbox.canonicalSite("sun4-9.vkuserphoto.ru"), "vk.com", "vk photo is the vk switch");
same(sandbox.siteCovers("api.rustore.ru", ["console.rustore.ru"]), true, "old exact host still covers the api");
same(sandbox.siteCovers("www.google.com", ["console.rustore.ru"]), false, "rustore does not cover google");
same(sandbox.nextSites([], "https://console.rustore.ru/apps"), ["rustore.ru"], "toggle stores the site");
same(sandbox.nextSites(["console.rustore.ru"], "https://api.rustore.ru/"), [], "toggle removes the whole site");
same(sandbox.widen("sun4-9.vkuserphoto.ru"), "vkuserphoto.ru", "numbered photo shard widens");
same(sandbox.widen("top-fwz1.mail.ru"), "top-fwz1.mail.ru", "mail counter stays exact");
same(sandbox.expandSites(["console.rustore.ru"], { "rustore.ru": ["imgsmail.ru"] }).indexOf("rustore.ru") >= 0, true, "site root is direct");
same(sandbox.expandSites(["console.rustore.ru"], { "rustore.ru": ["imgsmail.ru"] }).indexOf("imgsmail.ru") >= 0, true, "learned host is direct");
same(decide(sandbox.expandSites(["console.rustore.ru"], { "rustore.ru": ["imgsmail.ru"] }), 10809, "https://api.rustore.ru/x", "api.rustore.ru"), "DIRECT", "rustore api is direct");
same(decide(sandbox.expandSites(["console.rustore.ru"], { "rustore.ru": ["imgsmail.ru"] }), 10809, "https://img.imgsmail.ru/a.png", "img.imgsmail.ru"), "DIRECT", "learned image host is direct");
same(decide(sandbox.expandSites(["console.rustore.ru"], { "rustore.ru": ["imgsmail.ru"] }), 10809, "https://www.google.com/", "www.google.com"), "PROXY 127.0.0.1:10809", "google stays on the proxy beside rustore");
same(decide(sandbox.expandSites(["vk.com"]), 10809, "https://sun4-9.vkuserphoto.ru/a.png", "sun4-9.vkuserphoto.ru"), "DIRECT", "photo is direct");
same(decide(sandbox.expandSites(["vk.com"]), 10809, "https://www.google.com/", "www.google.com"), "PROXY 127.0.0.1:10809", "google stays on the proxy");

if (failed) process.exit(1);
console.log("pac checks ok");
