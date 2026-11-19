PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS usuarios (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nome        TEXT NOT NULL,
    cpf         TEXT NOT NULL UNIQUE,
    email       TEXT NOT NULL UNIQUE,
    senha_hash  TEXT NOT NULL,
    perfil      TEXT NOT NULL DEFAULT 'votante' CHECK (perfil IN ('admin', 'votante')),
    ativo       INTEGER NOT NULL DEFAULT 1,
    ultimo_acesso TEXT,             -- último login (NULL = nunca entrou)
    telefone    TEXT,               -- celular/WhatsApp, só dígitos
    termos_em   TEXT,               -- quando aceitou o tratamento de dados (LGPD)
    criado_em   TEXT
);

-- Cada condomínio é um "espaço" separado: unidades, votações, avisos e documentos pertencem a um deles.
CREATE TABLE IF NOT EXISTS condominios (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    nome           TEXT NOT NULL,              -- como está na convenção
    cnpj           TEXT UNIQUE,                -- só dígitos; opcional (condomínio novo pode não ter)
    tipo           TEXT NOT NULL DEFAULT 'residencial' CHECK (tipo IN ('residencial', 'comercial', 'misto')),
    cep            TEXT,
    logradouro     TEXT,
    numero         TEXT,
    complemento    TEXT,
    bairro         TEXT,
    cidade         TEXT,
    uf             TEXT,
    n_blocos       INTEGER,                    -- informado no cadastro (blocos/torres)
    n_unidades     INTEGER,                    -- informado no cadastro
    telefone       TEXT,                       -- portaria/administração
    email          TEXT,                       -- e-mail da administração
    administradora TEXT,                       -- empresa administradora, se houver
    convite_token  TEXT UNIQUE,                -- link de cadastro dos moradores
    criado_em      TEXT NOT NULL,
    criado_por     INTEGER REFERENCES usuarios(id)
);

-- Quem participa de cada condomínio e com qual papel. A mesma pessoa pode estar em vários.
CREATE TABLE IF NOT EXISTS membros (
    condominio_id   INTEGER NOT NULL REFERENCES condominios(id),
    usuario_id      INTEGER NOT NULL REFERENCES usuarios(id),
    papel           TEXT NOT NULL DEFAULT 'morador' CHECK (papel IN ('sindico', 'morador')),
    ativo           INTEGER NOT NULL DEFAULT 1,
    desde           TEXT NOT NULL,
    -- dados do mandato (só para o síndico)
    sindico_tipo    TEXT CHECK (sindico_tipo IN ('morador', 'profissional', 'empresa')),
    empresa_nome    TEXT,
    empresa_cnpj    TEXT,
    mandato_inicio  TEXT,
    mandato_fim     TEXT,
    PRIMARY KEY (condominio_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS unidades (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    condominio_id INTEGER NOT NULL REFERENCES condominios(id),
    bloco   TEXT NOT NULL,
    numero  TEXT NOT NULL,
    vaga    INTEGER NOT NULL DEFAULT 0,   -- 1 = unidade desocupada (marcado pelo síndico)
    UNIQUE (condominio_id, bloco, numero)
);

CREATE TABLE IF NOT EXISTS proprietarios (
    unidade_id  INTEGER NOT NULL REFERENCES unidades(id),
    usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
    PRIMARY KEY (unidade_id, usuario_id)
);

-- Quem está autorizado a votar por cada unidade (proprietário ou representante).
-- O histórico é mantido: trocas apenas desativam a autorização anterior.
CREATE TABLE IF NOT EXISTS autorizacoes_voto (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    unidade_id    INTEGER NOT NULL REFERENCES unidades(id),
    usuario_id    INTEGER NOT NULL REFERENCES usuarios(id),
    tipo          TEXT NOT NULL CHECK (tipo IN ('proprietario', 'representante')),
    indicado_por  INTEGER REFERENCES usuarios(id),
    data_inicio   TEXT NOT NULL,
    data_fim      TEXT,
    ativo         INTEGER NOT NULL DEFAULT 1
);

-- no máximo 1 votante ativo por unidade
CREATE UNIQUE INDEX IF NOT EXISTS uq_votante_ativo
    ON autorizacoes_voto (unidade_id) WHERE ativo = 1;

CREATE TABLE IF NOT EXISTS votacoes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    condominio_id INTEGER NOT NULL REFERENCES condominios(id),
    titulo        TEXT NOT NULL,
    descricao     TEXT,
    data_inicio   TEXT NOT NULL,   -- YYYY-MM-DDTHH:MM, horário do condomínio
    data_fim      TEXT NOT NULL,   -- a votação encerra automaticamente neste horário
    encerrada_em  TEXT,            -- preenchido quando o síndico encerra antes do prazo
    quorum_minimo INTEGER NOT NULL DEFAULT 0,          -- % mínimo de unidades votantes para valer
    maioria       TEXT NOT NULL DEFAULT 'simples',     -- simples | absoluta | dois_tercos
    fundamento    TEXT,                                -- ex.: "Art. 25 da Convenção"
    CHECK (data_fim > data_inicio)
);

CREATE TABLE IF NOT EXISTS opcoes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    votacao_id  INTEGER NOT NULL REFERENCES votacoes(id),
    texto       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS votos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    votacao_id  INTEGER NOT NULL REFERENCES votacoes(id),
    unidade_id  INTEGER NOT NULL REFERENCES unidades(id),
    usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
    opcao_id    INTEGER NOT NULL REFERENCES opcoes(id),
    data_hora   TEXT NOT NULL,     -- YYYY-MM-DD HH:MM:SS, horário do condomínio
    UNIQUE (votacao_id, unidade_id)   -- 1 voto por apartamento
);

-- Mural de avisos do síndico
CREATE TABLE IF NOT EXISTS avisos (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    condominio_id INTEGER NOT NULL REFERENCES condominios(id),
    titulo     TEXT NOT NULL,
    texto      TEXT NOT NULL,
    categoria  TEXT NOT NULL DEFAULT 'geral',
    fixado     INTEGER NOT NULL DEFAULT 0,
    autor_id   INTEGER NOT NULL REFERENCES usuarios(id),
    criado_em  TEXT NOT NULL,
    editado_em TEXT
);

-- Documentos do condomínio (convenção, regimento, atas assinadas...). O PDF fica em <pasta do banco>/documentos.
CREATE TABLE IF NOT EXISTS documentos (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    condominio_id INTEGER NOT NULL REFERENCES condominios(id),
    titulo         TEXT NOT NULL,
    categoria      TEXT NOT NULL DEFAULT 'outro',
    descricao      TEXT,
    arquivo        TEXT NOT NULL UNIQUE,
    nome_original  TEXT NOT NULL,
    tamanho        INTEGER NOT NULL,
    enviado_por    INTEGER NOT NULL REFERENCES usuarios(id),
    enviado_em     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS avisos_lidos (
    aviso_id    INTEGER NOT NULL REFERENCES avisos(id) ON DELETE CASCADE,
    usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
    lido_em     TEXT NOT NULL,
    PRIMARY KEY (aviso_id, usuario_id)
);
