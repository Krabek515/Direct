importScripts("suffixes.js", "pac.js", "i18n.js");

var MENU = "offvpn-tab";
var LINK = "offvpn-link";
var HOST = "com.offvpn.proxy";
var vpnUp = true;
var livePort = 0;
var directKeys = {};
var learned = {};
var pendingLearn = {};
var learnTimer = null;
var bumps = {};

function readState() {
  return chrome.storage.local.get({ enabled: true, sites: [], links: {}, lang: "" }).then(function (data) {
    return {
      enabled: data.enabled !== false,
      sites: Array.isArray(data.sites) ? data.sites : [],
      links: data.links && typeof data.links === "object" ? data.links : {},
      lang: data.lang === "ru" || data.lang === "en" ? data.lang : ""
    };
  });
}

function portFromServer(server) {
  if (!server) return 0;
  var chunk = String(server);
  var https = chunk.match(/https=([^;]+)/i);
  if (https) chunk = https[1];
  else chunk = chunk.split(";")[0];
  var match = chunk.match(/:(\d+)\s*$/);
  if (!match) return 0;
  var port = parseInt(match[1], 10);
  if (!(port > 0 && port < 65536)) return 0;
  return port;
}

function readProxy() {
  return chrome.runtime.sendNativeMessage(HOST, { get: "proxy" }).then(function (response) {
    var on = !!(response && response.on);
    return { on: on, port: on ? portFromServer(response.server) : 0, failed: false };
  }).catch(function () { return { on: true, port: 0, failed: true }; });
}

function indexState(state) {
  directKeys = {};
  learned = {};
  if (!state || !state.enabled || !vpnUp || !livePort) return;
  var i;
  var j;
  var key;
  for (i = 0; i < state.sites.length; i++) directKeys[canonicalSite(state.sites[i])] = 1;
  var links = state.links || {};
  for (key in links) {
    learned[key] = {};
    var list = links[key] || [];
    for (j = 0; j < list.length; j++) learned[key][list[j]] = 1;
  }
}

function applyProxy(state) {
  return readProxy().then(function (proxy) {
    vpnUp = proxy.failed ? true : !!proxy.on;
    livePort = proxy.port;
    indexState(state);
    if (!state.enabled || proxy.failed || !proxy.on || !proxy.port) {
      return chrome.proxy.settings.clear({ scope: "regular" });
    }
    return chrome.proxy.settings.set({
      value: {
        mode: "pac_script",
        pacScript: { data: buildPac(expandSites(state.sites, state.links), proxy.port) }
      },
      scope: "regular"
    });
  });
}

function iconPath(name) {
  return {
    16: "icons/" + name + "16.png",
    48: "icons/" + name + "48.png",
    128: "icons/" + name + "128.png"
  };
}

function directFor(state, url) {
  var host = hostFromUrl(url || "");
  if (!host) return false;
  if (!vpnUp) return true;
  if (!livePort) return false;
  return !!(state.enabled && siteCovers(host, state.sites));
}

function paintTab(tab, state) {
  if (!tab || typeof tab.id !== "number") return;
  var host = hostFromUrl(tab.url);
  var direct = directFor(state, tab.url);
  var name = !host ? "idle" : (direct ? "icon" : "vpn");
  chrome.action.setBadgeText({ tabId: tab.id, text: "" });
  chrome.action.setIcon({ tabId: tab.id, path: iconPath(name) });
  chrome.action.setTitle({
    tabId: tab.id,
    title: !host ? "Direct" : (direct ? t(state.lang, "directLabel") : t(state.lang, "through"))
  });
}

function repaint(state) {
  chrome.action.setBadgeText({ text: "" });
  chrome.tabs.query({}, function (tabs) {
    var i;
    for (i = 0; i < (tabs || []).length; i++) paintTab(tabs[i], state);
  });
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, function (tabs) {
    var tab = tabs && tabs[0];
    var host = hostFromUrl(tab && tab.url);
    var title = t(state.lang, "toggle");
    var enabled = !!state.enabled && !!host;
    if (!state.enabled) title = t(state.lang, "extOff");
    else if (!host) title = t(state.lang, "cannot");
    else if (directFor(state, tab.url)) title = t(state.lang, "turnOn");
    else title = t(state.lang, "turnOff");
    chrome.contextMenus.update(MENU, { title: title, enabled: enabled }, function () {
      void chrome.runtime.lastError;
    });
    chrome.contextMenus.update(LINK, { title: t(state.lang, "openLink") }, function () {
      void chrome.runtime.lastError;
    });
  });
}

function refresh() {
  return readState().then(function (state) {
    return applyProxy(state).then(function () {
      repaint(state);
      return state;
    });
  });
}

function bumpTab(tabId) {
  if (typeof tabId !== "number" || tabId < 0) return;
  var now = Date.now();
  var row = bumps[tabId];
  if (!row || now - row.at > 60000) row = { n: 0, at: now };
  if (row.n >= 2) return;
  row.n += 1;
  row.at = now;
  bumps[tabId] = row;
  chrome.tabs.reload(tabId);
}

function reloadMatching(keys) {
  chrome.tabs.query({}, function (tabs) {
    var i;
    for (i = 0; i < (tabs || []).length; i++) {
      var key = canonicalSite(hostFromUrl(tabs[i].url));
      if (key && keys[key]) bumpTab(tabs[i].id);
    }
  });
}

function reloadAffected(changes) {
  if (!changes) return;
  var keys = {};
  var i;
  var key;
  if (changes.sites) {
    var before = {};
    var after = {};
    var oldSites = changes.sites.oldValue || [];
    var newSites = changes.sites.newValue || [];
    for (i = 0; i < oldSites.length; i++) before[canonicalSite(oldSites[i])] = 1;
    for (i = 0; i < newSites.length; i++) after[canonicalSite(newSites[i])] = 1;
    for (key in before) if (!after[key]) keys[key] = 1;
    for (key in after) if (!before[key]) keys[key] = 1;
  }
  if (changes.links) {
    var oldLinks = changes.links.oldValue || {};
    var newLinks = changes.links.newValue || {};
    for (key in newLinks) {
      if ((newLinks[key] || []).join() !== (oldLinks[key] || []).join()) keys[key] = 1;
    }
  }
  reloadMatching(keys);
}

function reloadCovered() {
  readState().then(function (state) {
    if (!state.enabled) return;
    var keys = {};
    var i;
    for (i = 0; i < state.sites.length; i++) keys[canonicalSite(state.sites[i])] = 1;
    reloadMatching(keys);
  });
}

function probeHosts(hosts) {
  if (!hosts.length) return Promise.resolve([]);
  return chrome.runtime.sendNativeMessage(HOST, { get: "probe", hosts: hosts.join(",") }).then(function (response) {
    var open = response && typeof response.open === "string" ? response.open.split(",") : [];
    var allow = {};
    var i;
    for (i = 0; i < hosts.length; i++) allow[hosts[i]] = 1;
    return open.filter(function (host) { return host && allow[host]; });
  }).catch(function () { return []; });
}

function flushLearn() {
  learnTimer = null;
  var batch = pendingLearn;
  pendingLearn = {};
  var hosts = [];
  var key;
  var name;
  for (key in batch) {
    for (name in batch[key]) {
      if (hosts.indexOf(name) < 0 && hosts.length < 40) hosts.push(name);
    }
  }
  if (!hosts.length) return;
  readState().then(function (state) {
    if (!state.enabled) return;
    return probeHosts(hosts).then(function (open) {
      if (!open.length) return;
      var links = {};
      var existing = state.links || {};
      for (key in existing) links[key] = (existing[key] || []).slice();
      var changed = false;
      for (key in batch) {
        var listed = false;
        var s;
        for (s = 0; s < state.sites.length; s++) {
          if (canonicalSite(state.sites[s]) === key) listed = true;
        }
        if (!listed) continue;
        if (!links[key]) links[key] = [];
        var n;
        for (n = 0; n < open.length; n++) {
          if (!batch[key][open[n]]) continue;
          if (links[key].indexOf(open[n]) >= 0) continue;
          if (links[key].length >= 40) break;
          links[key].push(open[n]);
          changed = true;
        }
      }
      if (changed) chrome.storage.local.set({ links: links });
    });
  });
}

function rememberRequest(details) {
  if (!details || details.tabId < 0) return;
  var target = hostFromUrl(details.url);
  var from = hostFromUrl(details.initiator || details.documentUrl || "");
  if (!target || !from) return;
  var key = canonicalSite(from);
  if (!key || !directKeys[key]) return;
  if (canonicalSite(target) === key) return;
  if (hostMatches(target, "kaspersky-labs.com")) return;
  var wide = widen(target);
  if (!wide || (learned[key] && learned[key][wide])) return;
  if (!pendingLearn[key]) pendingLearn[key] = {};
  pendingLearn[key][wide] = 1;
  if (learnTimer) return;
  learnTimer = setTimeout(flushLearn, 600);
}

function ensureBypass(url) {
  var absolute = absoluteUrl(url);
  if (!absolute) return Promise.resolve("");
  return readState().then(function (state) {
    var host = hostFromUrl(absolute);
    var sites = siteCovers(host, state.sites) ? state.sites : nextSites(state.sites, absolute);
    var next = { enabled: true, sites: sites, links: state.links || {} };
    return chrome.storage.local.set({ enabled: true, sites: sites }).then(function () {
      return applyProxy(next).then(function () { return absolute; });
    });
  });
}

function openWithoutVpn(url) {
  return ensureBypass(url).then(function (absolute) {
    if (!absolute) return false;
    return chrome.tabs.create({ url: absolute, active: true }).then(function () { return true; });
  });
}

function setup() {
  chrome.contextMenus.removeAll(function () {
    chrome.contextMenus.create({
      id: MENU,
      title: "Direct connection",
      contexts: ["tab"]
    });
    chrome.contextMenus.create({
      id: LINK,
      title: "Open direct",
      contexts: ["link"],
      targetUrlPatterns: ["http://*/*", "https://*/*"]
    }, function () { refresh(); });
  });
}

chrome.runtime.onInstalled.addListener(function (details) {
  setup();
  if (details && (details.reason === "update" || details.reason === "install")) {
    setTimeout(reloadCovered, 700);
  }
});
chrome.runtime.onStartup.addListener(setup);
chrome.alarms.create("proxy", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(function () { refresh(); });
chrome.storage.onChanged.addListener(function (changes, area) {
  refresh().then(function () {
    if (area === "local") reloadAffected(changes);
  });
});
chrome.webRequest.onBeforeRequest.addListener(rememberRequest, { urls: ["http://*/*", "https://*/*"] });
chrome.tabs.onActivated.addListener(function () { readState().then(repaint); });
chrome.tabs.onUpdated.addListener(function (tabId, info, tab) {
  if (!(info.url || info.status === "complete")) return;
  readState().then(function (state) { paintTab(tab, state); });
});
chrome.windows.onFocusChanged.addListener(function (windowId) {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  readState().then(repaint);
});
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || message.type !== "open-direct") return;
  openWithoutVpn(message.url).then(function (ok) {
    sendResponse({ ok: !!ok });
  });
  return true;
});
chrome.contextMenus.onClicked.addListener(function (info, tab) {
  if (!info) return;
  if (info.menuItemId === LINK) {
    openWithoutVpn(info.linkUrl);
    return;
  }
  if (info.menuItemId !== MENU) return;
  readState().then(function (state) {
    if (!state.enabled) return;
    var url = (tab && tab.url) || (info && info.pageUrl) || "";
    if (!hostFromUrl(url)) return;
    chrome.storage.local.set({ enabled: true, sites: nextSites(state.sites, url) });
  });
});
setup();
