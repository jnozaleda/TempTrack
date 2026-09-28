# tempcheck-push

Cloudflare Worker que guarda las suscripciones a notificaciones de la web (Web Push). El envío diario lo hace GitHub Actions ([send-daily.mjs](../web/whatsapp/send-daily.mjs)): lee la lista de aquí y borra las suscripciones caducadas.

**Qué guarda:** la dirección de envío que da el navegador (opaca, sin datos personales), sus claves de cifrado, y la ciudad y el idioma del mensaje. Nada más: el Worker descarta cualquier otro campo.

## Endpoints

| Método | Ruta | Quién | Para qué |
|---|---|---|---|
| POST | `/subscribe` | la web (solo desde `ALLOWED_ORIGINS`) | alta o cambio de ciudad/idioma |
| POST | `/unsubscribe` | la web | baja |
| GET | `/subscriptions` | GitHub Actions, con `Authorization: Bearer ADMIN_TOKEN` | lista para el envío diario |
| DELETE | `/subscriptions` | GitHub Actions, con token | quitar caducadas |

## Despliegue (una vez)

```bash
cd push-worker
npm install
npx wrangler login                      # abre el navegador: autoriza con tu cuenta de Cloudflare
npx wrangler kv namespace create SUBS   # copia el id que devuelve en wrangler.toml
npx wrangler secret put ADMIN_TOKEN     # pega el token de administración
npx wrangler deploy                     # imprime la URL: https://tempcheck-push.<tu-subdominio>.workers.dev
```

Después:
- `web/app/app.js` → `PUSH_API = "<URL del Worker>"`
- GitHub → Settings → Secrets and variables → Actions:
  - **Variables** → `WEBPUSH_API` = URL del Worker
  - **Secrets** → `WEBPUSH_ADMIN_TOKEN` = el mismo token

## Probar en local

```bash
echo 'ADMIN_TOKEN=local-test-token' > .dev.vars
npx wrangler dev --port 8787
```

## Límites del plan gratuito

100.000 peticiones/día y 1.000 escrituras en KV al día: sobra para miles de suscriptores (cada alta o cambio de ciudad es una escritura; el envío diario es una lectura de lista).
