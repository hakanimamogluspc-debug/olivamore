#!/bin/bash
# Higgsfield'de uretilen tek yaprak + tek zeytin gorsellerini indirir,
# beyaz arka plani seffaflastirir, susleme PNG'leri olarak kaydeder.
set -e
HEDEF=/var/www/olivamore/assets/img/marka
mkdir -p "$HEDEF"
cd /tmp

wget -q -O yaprak-ham.png "https://d8j0ntlcm91z4.cloudfront.net/user_3EftlN5OZCYyOH413FmvQGEDa5g/hf_20260912_070150_b78cb10a-c9a1-4dcf-9f50-e62a045d6502.png"
wget -q -O zeytin-ham.png "https://d8j0ntlcm91z4.cloudfront.net/user_3EftlN5OZCYyOH413FmvQGEDa5g/hf_20260912_070308_dcc375e6-c28f-494d-a2b6-7fa145a6193c.png"

convert yaprak-ham.png -fuzz 5% -transparent white -trim +repage -resize 640x640 "$HEDEF/yaprak.png"
convert zeytin-ham.png -fuzz 5% -transparent white -trim +repage -resize 640x640 "$HEDEF/zeytin.png"
rm -f yaprak-ham.png zeytin-ham.png
chown www-data:www-data "$HEDEF/yaprak.png" "$HEDEF/zeytin.png"
ls -la "$HEDEF/yaprak.png" "$HEDEF/zeytin.png"
echo "SUSLEME-TAMAM"
