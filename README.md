# Quórum

Assembleias online para condomínios: o síndico cria as pautas, os moradores votam pelo celular ou computador,
e a votação **abre e encerra sozinha** nos horários definidos, publicando o resultado para todos.

- **Frontend:** React + TypeScript (Vite), Bootstrap 5.3 (react-bootstrap, tema em Sass) e Chart.js, em `frontend/`
- **Backend:** API JSON em Python/Flask + SQLite (`app.py`)
- **Deploy:** Docker + Caddy (HTTPS automático)

## Regras de votação

- 1 voto por apartamento em cada votação, que não pode ser alterado depois de confirmado.
- Vota o proprietário ou um representante indicado por ele, e cada unidade tem um único votante ativo.
- O voto é identificado: o síndico vê quem votou em quê e pode exportar a lista em CSV para a ata.
- O resultado fica visível para os moradores só depois do encerramento. O síndico acompanha a parcial.
- O encerramento é automático no horário definido, e o síndico também pode encerrar antes.
- Todos os horários usam o fuso de Brasília (`America/Sao_Paulo`).

## Rodar localmente (desenvolvimento)

Pré-requisitos: Python 3.11+ e Node 20+.

```bash
# backend
python -m venv venv
source venv/bin/activate              # Windows: venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt
python init_db.py --demo              # banco com dados de exemplo
FLASK_DEBUG=1 python app.py           # API em http://127.0.0.1:5050

# frontend (em outro terminal)
cd frontend
npm install
npm run dev                           # abre em http://127.0.0.1:5173 (repassa /api para o Flask)
```

Para servir tudo pelo Flask, sem o Vite: `cd frontend && npm run build` e depois acesse http://127.0.0.1:5050.

**Logins de demonstração**
- Síndico: `admin@condominio.com` / `admin123`
- Moradores: `morador1@teste.com` … `morador5@teste.com` / `123456`. A Ana (morador1) vota por duas
  unidades, e o Diego (morador4) é representante do B-102, indicado pela Elisa (morador5).

O `init_db.py` se recusa a apagar um banco existente. Para recriar do zero (**isso apaga todos os votos**),
use `python init_db.py --demo --force`.

Testes: `python -m pytest`

## Deploy na nuvem (Docker)

Serve para qualquer VPS com Docker: AWS Lightsail/EC2, DigitalOcean, Hetzner, Oracle Cloud, Hostinger VPS etc.

1. **DNS:** crie um registro `A` apontando o domínio (ex.: `votacao.seucondominio.com.br`) para o IP do servidor.
2. **Firewall:** libere as portas 80 e 443.
3. **No servidor:**
   ```bash
   git clone <url-do-repositorio> votacao && cd votacao
   cp .env.example .env
   nano .env                          # DOMINIO, CONDOMINIO_NOME, EMAIL_SINDICO, SENHA_SINDICO
   docker compose up -d --build
   ```
4. Acesse `https://SEU_DOMINIO`. O Caddy emite e renova o certificado HTTPS sozinho.
5. Entre com o e-mail e a senha do síndico definidos no `.env`, **troque a senha** (menu da conta → Trocar
   senha) e cadastre unidades, moradores e votações.

**Atualizar para uma nova versão:** `git pull && docker compose up -d --build`. Os dados ficam no volume `dados`.

**Backup:**
```bash
docker compose exec app python backup.py                         # cria /data/backups/votacao-AAAAMMDD-HHMMSS.db
docker compose cp app:/data/backups ./backups                    # copia os backups para fora do container
```
Recomendo agendar o backup no `cron` do servidor e guardar uma cópia fora dele.

**Logs:** `docker compose logs -f app`

### Variáveis de ambiente (`.env`)

| Variável | Para que serve |
|---|---|
| `DOMINIO` | Domínio público. O Caddy emite o HTTPS para ele. |
| `CONDOMINIO_NOME` | Opcional. Nome do condomínio, exibido junto da marca Quórum. |
| `EMAIL_SINDICO` / `SENHA_SINDICO` | Login inicial do síndico, usado só quando o banco é criado. |
| `COOKIE_SECURE` | `1` em produção: cookies trafegam só por HTTPS. |
| `DEMO` | `1` cria o banco com dados de exemplo, para testar. |
| `SECRET_KEY` | Opcional. Se não for definida, uma chave aleatória é gerada e guardada em `/data/secret_key`. |

Na primeira vez que o síndico entra, o painel mostra um roteiro de **primeiros passos**: cadastrar
unidades e moradores, vincular os votantes e criar a primeira votação.

O nome do produto fica em `frontend/src/marca.ts`, e o símbolo em `Simbolo` (`frontend/src/components/ui.tsx`)
e no `frontend/public/favicon.svg`.

## Estrutura

```
app.py              API (autenticação, votações, administração) e entrega do frontend
utils.py            datas no fuso do condomínio, validação de CPF
init_db.py          criação do banco (+ dados de demonstração)
schema.sql          tabelas
backup.py           cópia consistente do banco
tests/              testes da API (pytest)
frontend/           React + TypeScript
  src/pages/        Inicio (site), Entrar, Votacoes, Votacao, TrocarSenha, admin/*
  src/components/   layout, avisos/confirmações, contagem regressiva, ícones
Dockerfile          build do React + imagem Python com gunicorn
docker-compose.yml  app + Caddy (HTTPS)
Caddyfile           proxy reverso e cabeçalhos de segurança
```

## Segurança

- Senhas guardadas com hash (werkzeug/pbkdf2), com mínimo de 8 caracteres para senhas novas.
- Proteção CSRF: token por sessão, enviado no cabeçalho `X-CSRF-Token`.
- Cookie de sessão `HttpOnly` e `SameSite=Lax`, além de `Secure` quando estiver em HTTPS.
- Bloqueio temporário após 5 tentativas de login erradas em 10 minutos, por IP.
- HTTPS obrigatório e cabeçalhos de segurança (HSTS, nosniff, frame deny) via Caddy.
- O CSV exportado neutraliza fórmulas de planilha.
- O container roda como usuário sem privilégios.
