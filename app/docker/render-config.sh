#!/bin/sh
# Generates runtime configuration at container start (runs via the nginx image's
# /docker-entrypoint.d/ mechanism, before nginx launches).
#
# SECURITY: API keys are NOT written into the browser anymore. They are injected
# server-side by the nginx /api proxy (the generated /etc/nginx/api/*.conf). The
# browser only learns WHICH providers are configured. The unlock password is
# verified server-side too, so loading the page does not expose anything.
set -eu

HTML_CONFIG="/usr/share/nginx/html/config.js"
API_DIR="/etc/nginx/api"
mkdir -p "$API_DIR"

# Server-side history store (a mounted volume so it survives redeploys). Make it
# writable by the nginx worker user. The index (metadata) and image files live
# under /var/lib/photoshot/api/history so the nginx `root` maps cleanly.
HISTORY_ROOT="/var/lib/photoshot/api/history"
mkdir -p "$HISTORY_ROOT/img"
chown -R nginx:nginx /var/lib/photoshot 2>/dev/null || true

GEMINI_KEY="${GEMINI_API_KEY:-}"
WAVESPEED_KEY="${WAVESPEED_API_KEY:-}"
OPENROUTER_KEY="${OPENROUTER_API_KEY:-}"
APP_PW="${APP_PASSWORD:-changeme}"
OPENROUTER_REFERER="${OPENROUTER_REFERER:-https://photo-shot.example.com}"

bool() { [ -n "$1" ] && printf 'true' || printf 'false'; }

# 1) Browser config: only provider availability, never the keys.
cat > "$HTML_CONFIG" <<EOF
window.__APP_CONFIG__ = {
  "providers": {
    "gemini": $(bool "$GEMINI_KEY"),
    "wavespeed": $(bool "$WAVESPEED_KEY"),
    "openrouter": $(bool "$OPENROUTER_KEY")
  }
};
EOF

# 2) http-context: the unlock-password check used by the /api locations.
cat > "$API_DIR/http-auth.conf" <<EOF
map \$http_x_app_password \$app_auth_ok {
    default 0;
    "$APP_PW" 1;
}
# History images allow an open GET (so <img> tags work cross-device) but gate
# writes (PUT/DELETE) behind the unlock password.
map "\$request_method:\$app_auth_ok" \$history_write_denied {
    default 0;
    "PUT:0" 1;
    "DELETE:0" 1;
}
EOF

# 3) server-context: the API proxy. Each location injects the real key and
#    strips the internal password header before forwarding upstream.
cat > "$API_DIR/server-api.conf" <<EOF
location = /api/auth {
    # limit_req runs in preaccess; defer the 401/204 to a named location via
    # try_files (precontent) so the rate limit is actually applied first.
    limit_req zone=authlimit burst=10 nodelay;
    try_files /nonexistent-auth @authcheck;
}
location @authcheck {
    if (\$app_auth_ok = 0) { return 401; }
    return 204;
}

location /api/gemini/ {
    if (\$app_auth_ok = 0) { return 401; }
    proxy_pass https://generativelanguage.googleapis.com/;
    proxy_set_header Host generativelanguage.googleapis.com;
    proxy_ssl_server_name on;
    proxy_set_header x-goog-api-key "$GEMINI_KEY";
    proxy_set_header X-App-Password "";
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
}

location /api/wavespeed/ {
    if (\$app_auth_ok = 0) { return 401; }
    proxy_pass https://api.wavespeed.ai/api/v3/;
    proxy_set_header Host api.wavespeed.ai;
    proxy_ssl_server_name on;
    proxy_set_header Authorization "Bearer $WAVESPEED_KEY";
    proxy_set_header X-App-Password "";
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
}

location /api/openrouter/ {
    if (\$app_auth_ok = 0) { return 401; }
    proxy_pass https://openrouter.ai/api/v1/;
    proxy_set_header Host openrouter.ai;
    proxy_ssl_server_name on;
    proxy_set_header Authorization "Bearer $OPENROUTER_KEY";
    proxy_set_header HTTP-Referer "$OPENROUTER_REFERER";
    proxy_set_header X-Title "Photo-Shot";
    proxy_set_header X-App-Password "";
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
}

# Shared history: metadata index (password-gated read + write).
location = /api/history/index.json {
    if (\$app_auth_ok = 0) { return 401; }
    root /var/lib/photoshot;
    dav_methods PUT DELETE;
    create_full_put_path on;
    dav_access user:rw group:rw all:r;
    client_max_body_size 8m;
    default_type application/json;
    add_header Cache-Control "no-store" always;
}

# Shared history: generated image files. Open GET (unguessable UUID names) so
# <img> works on any device; writes require the password.
location /api/history/img/ {
    if (\$history_write_denied) { return 401; }
    root /var/lib/photoshot;
    dav_methods PUT DELETE;
    create_full_put_path on;
    dav_access user:rw group:rw all:r;
    client_max_body_size 30m;
    add_header Cache-Control "private, max-age=86400" always;
}
EOF

echo "[render-config] wrote browser config + /api proxy (gemini=$(bool "$GEMINI_KEY") wavespeed=$(bool "$WAVESPEED_KEY") openrouter=$(bool "$OPENROUTER_KEY"))"
