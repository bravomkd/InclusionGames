# Deploying InclusionGames to Hetzner

Your site now has a Node backend, so it runs as a Node app behind Nginx with
HTTPS. **HTTPS is mandatory** — the games use the webcam (`getUserMedia`), and
browsers block the camera on plain `http://`.

These steps assume a Hetzner Cloud server running **Ubuntu 22.04/24.04**.

---

## 1. Get the files onto the server

From your computer, in the project folder:

```bash
# zip everything except node_modules and the local db
tar --exclude=node_modules --exclude=data -czf site.tar.gz .
scp site.tar.gz root@YOUR_SERVER_IP:/var/www/
```

On the server:

```bash
ssh root@YOUR_SERVER_IP
mkdir -p /var/www/inclusion && tar -xzf /var/www/site.tar.gz -C /var/www/inclusion
cd /var/www/inclusion
```

## 2. Install Node + dependencies

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
npm install --omit=dev
```

## 3. Configure environment

```bash
cp .env.example .env
nano .env
```

Set at least:

```
PORT=3000
APP_URL=https://www.inclusion-games.com
JWT_SECRET=<paste a long random string>
```

Add SMTP + Stripe/PayPal keys when you're ready (the app runs without them).

## 4. Keep it running with PM2

```bash
npm install -g pm2
pm2 start server.js --name inclusion
pm2 save
pm2 startup        # run the command it prints, so it survives reboots
```

The app now listens on `http://127.0.0.1:3000`.

## 5. Nginx + HTTPS (Let's Encrypt)

```bash
apt-get install -y nginx certbot python3-certbot-nginx
nano /etc/nginx/sites-available/inclusion
```

Paste:

```nginx
server {
  server_name www.inclusion-games.com inclusion-games.com;
  client_max_body_size 10M;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Enable + get the certificate:

```bash
ln -s /etc/nginx/sites-available/inclusion /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d www.inclusion-games.com -d inclusion-games.com
```

Certbot installs the SSL certificate and auto-renews it.

## 6. Point the domain

In your DNS (where inclusion-games.com is registered), set an **A record** for
`@` and `www` to your Hetzner server's IP. Wait for it to propagate, then open
`https://www.inclusion-games.com`.

---

## Updating after changes

```bash
# upload the changed files (or use git), then on the server:
cd /var/www/inclusion
npm install --omit=dev      # only if dependencies changed
pm2 restart inclusion
```

## Quick health checks on the server

```bash
pm2 logs inclusion          # watch app logs (verification/reset links print here if no SMTP)
curl -s http://127.0.0.1:3000/api/health   # should return {"ok":true,...}
```

## Stripe webhook (when you go live)

Point a Stripe webhook at `https://www.inclusion-games.com/api/payments/webhook/stripe`
and put the signing secret in `.env` as `STRIPE_WEBHOOK_SECRET`, then `pm2 restart inclusion`.
