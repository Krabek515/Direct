function load() {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    var url = tabs && tabs[0] ? tabs[0].url || "" : "";
    chrome.storage.local.get({ enabled: true, sites: [], lang: "" }, function (data) {
      render(data, url);
    });
  });
}

function render(data, url) {
  var host = hostFromUrl(url);
  var enabled = data.enabled !== false;
  var sites = data.sites || [];
  var lang = uiLang(data.lang);
  var direct = enabled && !!host && siteCovers(host, sites);
  var mark = document.getElementById("mark");
  var hostEl = document.getElementById("host");
  var state = document.getElementById("state");
  var flip = document.getElementById("flip");
  var power = document.getElementById("power");

  document.documentElement.lang = lang;
  hostEl.textContent = host || t(lang, "thisPage");
  mark.className = !enabled || !host ? "" : (direct ? "direct" : "vpn");
  state.className = mark.className;

  if (!enabled) {
    state.textContent = t(lang, "extOff");
    flip.hidden = true;
  } else if (!host) {
    state.textContent = t(lang, "notSite");
    flip.hidden = true;
  } else if (direct) {
    state.textContent = t(lang, "directLabel");
    flip.hidden = false;
    flip.textContent = t(lang, "turnOn");
  } else {
    state.textContent = t(lang, "through");
    flip.hidden = false;
    flip.textContent = t(lang, "turnOff");
  }

  power.textContent = enabled ? t(lang, "extOffBtn") : t(lang, "extOnBtn");
  document.getElementById("link").placeholder = t(lang, "link");
  document.getElementById("go").textContent = t(lang, "openDirect");
  var choices = document.querySelectorAll("#lang button");
  var i;
  for (i = 0; i < choices.length; i++) {
    choices[i].className = choices[i].getAttribute("data-lang") === lang ? "active" : "";
    choices[i].onclick = function () {
      chrome.storage.local.set({ lang: this.getAttribute("data-lang") }, load);
    };
  }
  flip.onclick = function () {
    chrome.storage.local.set({ enabled: true, sites: nextSites(sites, url) }, load);
  };
  power.onclick = function () {
    chrome.storage.local.set({ enabled: !enabled }, load);
  };
  document.getElementById("open").onsubmit = function (event) {
    event.preventDefault();
    var input = document.getElementById("link");
    chrome.runtime.sendMessage({ type: "open-direct", url: input.value }, function (answer) {
      if (chrome.runtime.lastError || !answer || !answer.ok) input.style.borderColor = "#dc2626";
    });
  };
  document.getElementById("link").oninput = function () {
    document.getElementById("link").style.borderColor = "#e4e7eb";
  };
}

load();
