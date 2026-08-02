const fs = require("fs");
const path = require("path");

const srcDir = path.join(__dirname, "..", "src", "lua");
const destDir = path.join(__dirname, "..", "dist", "lua");

fs.mkdirSync(destDir, { recursive: true });

for (const file of fs.readdirSync(srcDir)) {
  if (file.endsWith(".lua")) {
    fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
  }
}
