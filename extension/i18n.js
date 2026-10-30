var COPY = {
  en: {
    directLabel: "Direct",
    through: "Through proxy",
    turnOn: "Through proxy",
    turnOff: "Direct",
    notSite: "Not a site",
    thisPage: "This page",
    extOff: "Extension is off",
    extOffBtn: "Turn extension off",
    extOnBtn: "Turn extension on",
    link: "Link",
    openDirect: "Direct",
    toggle: "Direct connection",
    cannot: "Routing stays as it is",
    openLink: "Open direct"
  },
  ru: {
    directLabel: "Напрямую",
    through: "Через прокси",
    turnOn: "Через прокси",
    turnOff: "Напрямую",
    notSite: "Не сайт",
    thisPage: "Эта страница",
    extOff: "Расширение выключено",
    extOffBtn: "Выключить расширение",
    extOnBtn: "Включить расширение",
    link: "Ссылка",
    openDirect: "Напрямую",
    toggle: "Прямое подключение",
    cannot: "Здесь маршрут не меняется",
    openLink: "Открыть напрямую"
  }
};

function uiLang(stored) {
  if (stored === "ru" || stored === "en") return stored;
  var ui = "";
  try {
    ui = chrome.i18n && chrome.i18n.getUILanguage ? chrome.i18n.getUILanguage() : "";
  } catch (e) {
    ui = "";
  }
  return String(ui || "").toLowerCase().indexOf("ru") === 0 ? "ru" : "en";
}

function t(lang, key) {
  var pack = COPY[uiLang(lang)] || COPY.en;
  return pack[key] || COPY.en[key] || "";
}
