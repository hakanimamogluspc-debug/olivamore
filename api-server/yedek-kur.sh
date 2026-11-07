#!/bin/bash
# Gunluk otomatik yedek: /var/www/olivamore-data (siparisler, uyeler, cms...) + panelden yuklenen gorseller
# Her gece 03:30, /root/yedekler altina tarihli .tar.gz; son 30 gun saklanir.
# Kurulum (bir kez): bash /root/olivamore-repo/api-server/yedek-kur.sh
set -e
cat > /usr/local/bin/olivamore-yedek <<'EOF'
#!/bin/bash
mkdir -p /root/yedekler
T=$(date +%Y%m%d-%H%M)
tar --exclude='*.tmp' -czf /root/yedekler/olivamore-veri-$T.tar.gz -C /var/www olivamore-data 2>/dev/null || true
tar -czf /root/yedekler/olivamore-gorsel-$T.tar.gz -C /var/www/olivamore/assets img 2>/dev/null || true
find /root/yedekler -name 'olivamore-*.tar.gz' -mtime +30 -delete
# Panel > Sağlık ekranı için durum dosyası (API servisi /root'u okuyamaz)
ADET=$(ls /root/yedekler/olivamore-veri-*.tar.gz 2>/dev/null | wc -l)
BOYUT=$(du -sh /root/yedekler 2>/dev/null | cut -f1)
echo "{\"t\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"ad\":\"olivamore-veri-$T.tar.gz\",\"adet\":$ADET,\"boyut\":\"$BOYUT\"}" > /var/www/olivamore-data/yedek-durum.json
chmod 644 /var/www/olivamore-data/yedek-durum.json
EOF
chmod +x /usr/local/bin/olivamore-yedek
( crontab -l 2>/dev/null | grep -v olivamore-yedek; echo "30 3 * * * /usr/local/bin/olivamore-yedek" ) | crontab -
/usr/local/bin/olivamore-yedek
ls -lh /root/yedekler | tail -4
cat /var/www/olivamore-data/yedek-durum.json; echo
echo "YEDEK-KURULDU (her gece 03:30)"
