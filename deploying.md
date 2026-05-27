# ChatLegal deployment

The repo now builds two legal-document frontends and one shared API.

## DNS

Point these records to the VPS:

```text
chatconstituicao.pt           A 95.216.185.20
api.chatconstituicao.pt       A 95.216.185.20
chatcodigocivil.pt            A 95.216.185.20
www.chatcodigocivil.pt        A 95.216.185.20
api.chatcodigocivil.pt        A 95.216.185.20
```

## API env

Create `/opt/chatlegal/apps/api/.env`:

```env
PORT=3088
VERCEL_AI_GATEWAY_API_KEY=
ALLOWED_ORIGINS=https://chatconstituicao.pt,https://www.chatconstituicao.pt,https://chatcodigocivil.pt,https://www.chatcodigocivil.pt
APP_HOST_DOCUMENT_MAP=api.chatconstituicao.pt:constituicao,api.chatcodigocivil.pt:codigo-civil
APP_HOST_FRONTEND_MAP=api.chatconstituicao.pt:https://chatconstituicao.pt,api.chatcodigocivil.pt:https://chatcodigocivil.pt
```

## Frontend env

Build the Constituição site with:

```sh
VITE_DOCUMENT_ID=constituicao \
VITE_API_URL=https://api.chatconstituicao.pt \
pnpm --filter @chatconstituicao/web build
```

Build the Código Civil site with:

```sh
VITE_DOCUMENT_ID=codigo-civil \
VITE_API_URL=https://api.chatcodigocivil.pt \
pnpm --filter @chatconstituicao/web build
```

Copy the resulting `apps/web/dist` to separate deploy directories, for example:

```text
/opt/chatlegal/apps/web/dist-constituicao
/opt/chatlegal/apps/web/dist-codigo-civil
```

## systemd

`/etc/systemd/system/chatlegal-api.service`:

```ini
[Unit]
Description=ChatLegal API
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/chatlegal
ExecStart=/usr/bin/node apps/api/dist/index.js
EnvironmentFile=/opt/chatlegal/apps/api/.env
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## Caddy

```caddy
chatconstituicao.pt, www.chatconstituicao.pt {
  root * /opt/chatlegal/apps/web/dist-constituicao
  try_files {path} /index.html
  file_server
}

chatcodigocivil.pt, www.chatcodigocivil.pt {
  root * /opt/chatlegal/apps/web/dist-codigo-civil
  try_files {path} /index.html
  file_server
}

api.chatconstituicao.pt, api.chatcodigocivil.pt {
  reverse_proxy localhost:3088
}
```

## Verification

```sh
curl https://api.chatconstituicao.pt/api/health
curl https://api.chatcodigocivil.pt/api/health
```
