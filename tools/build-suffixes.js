const fs = require("fs");
const https = require("https");
const path = require("path");

function download() {
  return new Promise((resolve, reject) => {
    https.get("https://publicsuffix.org/list/public_suffix_list.dat", (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, (next) => {
          const chunks = [];
          next.on("data", (c) => chunks.push(c));
          next.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        }).on("error", reject);
        return;
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    }).on("error", reject);
  });
}

async function main() {
const text = await download();
const exact = {};
const wild = {};
const except = {};
text.split(/\r?\n/).forEach((line) => {
  const trimmed = line.trim().toLowerCase();
  if (!trimmed || trimmed.startsWith("//")) return;
  if (trimmed.startsWith("!")) except[trimmed.slice(1)] = 1;
  else if (trimmed.startsWith("*.")) wild[trimmed.slice(2)] = 1;
  else if (trimmed.indexOf(".") >= 0) exact[trimmed] = 1;
});
const out = [
  "var SUFFIX_EXACT = " + JSON.stringify(exact) + ";",
  "var SUFFIX_WILD = " + JSON.stringify(wild) + ";",
  "var SUFFIX_EXCEPT = " + JSON.stringify(except) + ";",
  ""
].join("\n");
const dest = path.join(__dirname, "..", "extension", "suffixes.js");
fs.writeFileSync(dest, out);
console.log("exact", Object.keys(exact).length, "wild", Object.keys(wild).length, "except", Object.keys(except).length, "bytes", out.length);
}
main();
