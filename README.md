# BulkZap

Plataforma de disparos WhatsApp em grupos com anti-ban, fallback Cloud API e alertas por email. Monorepo Bun + Turborepo.

## Stack

- **Backend**: ElysiaJS (Bun) + TypeScript
- **ORM**: Drizzle
- **Banco**: Postgres 16
- **Fila/Agendamento**: BullMQ + Redis
- **Frontend**: Next.js 16 (App Router) + Tailwind 4
- **WhatsApp**: Baileys (driver principal) + Cloud API (driver opcional)
- **Email**: Resend
- **Hospedagem**: 1 EC2 com Postgres + Redis nativos, apps via PM2

## Estrutura

```
apps/
  api/   → Elysia + Baileys + BullMQ
  web/   → Next.js (dashboard)
packages/
  db/    → Drizzle schema compartilhado
```

## Dev: como rodar localmente

### 1) Pré-requisitos

```bash
# Instale apenas se ainda não tiver
brew install bun
brew install redis
brew services start redis
```

Postgres roda em Docker; o resto é nativo.

### 2) Subir o Postgres

```bash
docker compose up -d
```

### 3) Configurar env e migrar

```bash
cp .env.example .env
# edite .env conforme necessário (RESEND_API_KEY etc.)

bun install
cd packages/db && bun run db:migrate && cd -
```

### 4) Rodar API + Web

Em um terminal:

```bash
bun run dev
```

- API: http://localhost:3000 (health: `/health`)
- Web: http://localhost:3001
- Bull Board (filas BullMQ): http://localhost:3000/admin/queues — protegido por basic auth (`BULL_BOARD_USER` / `BULL_BOARD_PASS` no `.env`). Se essas vars estiverem vazias, o painel **não sobe**.

## Golden path (cenário do cliente real)

1. Abra http://localhost:3001
2. **Números** → adicione um número com `warmupMode=off`, `dailyLimit` em branco
3. Clique em **Abrir** no número criado → **Conectar** → escaneie o QR
4. Após conexão: **Sincronizar grupos**
5. **Templates** → crie um template (ex: `"Oi {{nome}}, novidade!"`)
6. **Listas** → crie lista de **grupos** e selecione os alvos
7. **Campanhas → Nova campanha**:
   - Categoria `marketing`, template, lista, pool com o número conectado
   - Jitter 15–90s
   - Confirma consent LGPD
8. **Revisar disparo**: o sistema mostra estimativa de duração + valida que o número é membro de todos os grupos
9. **Iniciar disparo** → workers BullMQ processam mensagem por mensagem com jitter

## Produção: deploy em EC2 (sem Docker)

### Provisionamento

```bash
# Ubuntu 22.04 LTS na EC2 (t3.small ou t3.medium)
sudo apt update
sudo apt install -y postgresql-16 redis-server git curl
curl -fsSL https://bun.sh/install | bash
bun install -g pm2

# Postgres
sudo -u postgres createuser bulkzap --pwprompt
sudo -u postgres createdb bulkzap -O bulkzap

# Redis: garantir persistência AOF
sudo sed -i 's/^appendonly no/appendonly yes/' /etc/redis/redis.conf
sudo sed -i 's/^# appendfsync everysec/appendfsync everysec/' /etc/redis/redis.conf
sudo systemctl restart redis-server
sudo systemctl enable postgresql redis-server
```

### Deploy

```bash
git clone <repo-url> /opt/bulkzap
cd /opt/bulkzap
cp .env.example .env  # editar com credenciais reais
bun install
cd packages/db && bun run db:migrate && cd -
cd apps/web && bun run build && cd -

pm2 start ecosystem.config.js
pm2 save
pm2 startup  # habilita restart no boot
```

### Backup diário (cron)

`crontab -e`:

```cron
0 3 * * * pg_dump -U bulkzap -Fc bulkzap | aws s3 cp - s3://bulkzap-backups/$(date +\%F).dump
```

### Health monitoring

- `curl localhost:3000/health` → `{"ok":true}`
- CloudWatch alarm em `/health` (via EC2 instance metric ou external HTTP check) → email se cair

## Recursos principais

- **Driver Baileys**: auth state persistido no Postgres (tabelas `baileys_creds`/`baileys_keys`); restart do app retoma sessão.
- **Driver Cloud API**: para envios 1-a-1 transacionais (não suporta grupos).
- **Validação pool × grupo**: antes do disparo, sistema confirma que todos os números do pool são membros de todos os grupos alvo; bloqueia se algum não for.
- **Anti-ban como sugestão, não bloqueio**: warmup é opt-in, limite diário pode ser nulo (sem limite). Cenário "número novo + 100 grupos no mesmo dia" funciona.
- **Pause automático em ban real**: ao receber statusCode 401/403/440/515 no `connection.update`, conta vai para `banned`, campanha pausa, email dispara.
- **Throttle de alertas**: máx 1 email por `accountId` × `eventType` em 15min (Redis).

## Comandos úteis

```bash
# Typecheck
bun run check-types

# Lint
bun run lint

# Build
bun run build

# Banco (cwd packages/db)
bun run db:generate    # gerar nova migração após mudar schema
bun run db:migrate     # aplicar migrações pendentes
bun run db:studio      # UI gráfica
```

## Limites e riscos conhecidos

1. **Cloud API + grupos**: a API oficial não suporta envio para grupos do jeito que o cliente usa hoje. Cloud API entra apenas como segundo driver para DMs.
2. **Bans continuam acontecendo no Baileys**: o anti-ban reduz frequência, não elimina. A UX assume isso (alertas, rotação, fácil substituição de número).
3. **Marketing em grupos é cinza legalmente** (LGPD): checkbox de consent é obrigatório na criação de campanha categoria=marketing.
4. **EC2 single-host é SPOF**: aceitável para um único cliente. Backup diário S3 + runbook de restore. Em SaaS futuro, separar Postgres (RDS), Redis (ElastiCache) e app (ECS).
