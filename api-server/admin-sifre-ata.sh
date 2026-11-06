#!/bin/bash
# Panel giriş sayfası için kullanıcı adı + şifre atar (env.json'a scrypt hash yazar).
set -e
ENVDOSYA=/var/www/olivamore-data/env.json
read -p "Panel kullanıcı adı [hakan]: " KULLANICI
KULLANICI=${KULLANICI:-hakan}
read -s -p "Yeni panel şifresi: " SIFRE1; echo
read -s -p "Tekrar: " SIFRE2; echo
if [ "$SIFRE1" != "$SIFRE2" ] || [ -z "$SIFRE1" ]; then echo "Şifreler uyuşmadı."; exit 1; fi
KULLANICI="$KULLANICI" SIFRE="$SIFRE1" node -e '
const fs = require("fs"), crypto = require("crypto");
const yol = "/var/www/olivamore-data/env.json";
const env = fs.existsSync(yol) ? JSON.parse(fs.readFileSync(yol, "utf8")) : {};
const tuz = crypto.randomBytes(16).toString("hex");
env.adminKullanici = process.env.KULLANICI;
env.adminTuz = tuz;
env.adminHash = crypto.scryptSync(process.env.SIFRE, tuz, 64).toString("hex");
fs.writeFileSync(yol, JSON.stringify(env, null, 2));
console.log("env.json güncellendi: adminKullanici=" + env.adminKullanici);
'
rm -f /var/www/olivamore-data/admin-oturum.json
systemctl restart olivamore-api
echo "SIFRE-TAMAM — giriş sayfası: https://olivamore.de/panel-giris"
