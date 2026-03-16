# API Anki Extractor — Documentação Técnica

> [!info] Visão Geral
> API em NestJS com Prisma para receber arquivos `.apkg` (Anki), extrair todo o conteúdo (cards, decks, notas, mídias) e retornar em JSON estruturado com as mídias separadas. O objetivo é ter um serviço reutilizável que sempre que receber um arquivo `.apkg`, retorne os dados prontos para consumo em qualquer aplicação frontend.

---

## Stack Tecnológica

| Tecnologia | Uso |
| --- | --- |
| **NestJS** | Framework principal da API |
| **Prisma** | ORM para persistir os dados extraídos |
| **PostgreSQL** | Banco de dados |
| **Multer** | Upload de arquivos `.apkg` |
| **adm-zip** ou **unzipper** | Extração do `.apkg` (que é um ZIP) |
| **better-sqlite3** | Leitura do banco SQLite interno do Anki (`collection.anki2` / `collection.anki21`) |
| **AWS S3** ou **local storage** | Armazenamento das mídias extraídas (imagens, áudios) |
| **Sharp** | Processamento de imagens (thumbnails, otimização) |

---

## Como funciona um arquivo .apkg

O `.apkg` é um arquivo ZIP que contém:

```
arquivo.apkg (ZIP)
├── collection.anki2       ← Banco SQLite com TODOS os dados
│   ├── tabela: col        ← Configuração da coleção (decks, models, fields)
│   ├── tabela: notes      ← Notas (conteúdo dos cards: campos, tags)
│   ├── tabela: cards      ← Cards (frente/verso, associação com notas e decks)
│   └── tabela: revlog     ← Histórico de revisões (opcional)
├── media                  ← Arquivo JSON mapeando índices para nomes de arquivo
├── 0                      ← Arquivo de mídia (imagem, áudio) referenciado como "0"
├── 1                      ← Arquivo de mídia referenciado como "1"
├── 2                      ← ...
└── ...
```

### Estrutura do SQLite interno

**Tabela `col` (collection):**
- `models` — JSON com os modelos de nota (define quais campos cada tipo de nota tem)
- `decks` — JSON com os decks (pastas/grupos de cards)
- `dconf` — Configurações de deck

**Tabela `notes`:**
- `id` — ID da nota
- `mid` — ID do modelo (referência ao `models` da tabela `col`)
- `flds` — Campos separados por `\x1f` (unit separator). Ex: "pergunta\x1fresposta"
- `tags` — Tags da nota separadas por espaço
- `sfld` — Campo de ordenação (geralmente o primeiro campo)

**Tabela `cards`:**
- `id` — ID do card
- `nid` — ID da nota associada
- `did` — ID do deck
- `ord` — Ordinal (qual template do modelo está sendo usado)
- `type` — Tipo (0=new, 1=learning, 2=review)
- `queue` — Estado na fila de revisão
- `due` — Data de vencimento
- `ivl` — Intervalo atual
- `factor` — Fator de facilidade
- `reps` — Número de repetições
- `lapses` — Número de lapsos

**Arquivo `media`:**
- JSON simples mapeando índice numérico para nome original do arquivo
- Ex: `{"0": "image_001.jpg", "1": "audio_pergunta.mp3", "2": "photo.png"}`

---

## Arquitetura da API

```
src/
├── app.module.ts
├── main.ts
├── common/
│   ├── filters/
│   ├── interceptors/
│   └── utils/
│       └── anki-parser.util.ts        ← Lógica de parse do SQLite
├── upload/
│   ├── upload.module.ts
│   ├── upload.controller.ts           ← POST /upload (recebe .apkg)
│   └── upload.service.ts              ← Orquestra extração
├── extraction/
│   ├── extraction.module.ts
│   ├── extraction.service.ts          ← Extrai ZIP, lê SQLite, mapeia mídias
│   └── dto/
│       ├── extracted-deck.dto.ts
│       ├── extracted-note.dto.ts
│       └── extracted-card.dto.ts
├── decks/
│   ├── decks.module.ts
│   ├── decks.controller.ts            ← GET /decks, GET /decks/:id
│   ├── decks.service.ts
│   └── dto/
├── cards/
│   ├── cards.module.ts
│   ├── cards.controller.ts            ← GET /cards, GET /cards/:id
│   ├── cards.service.ts
│   └── dto/
├── media/
│   ├── media.module.ts
│   ├── media.controller.ts            ← GET /media/:id (serve arquivo)
│   ├── media.service.ts               ← Upload para S3/local
│   └── dto/
└── prisma/
    ├── prisma.module.ts
    ├── prisma.service.ts
    └── schema.prisma
```

---

## Schema Prisma

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Import {
  id            String   @id @default(uuid())
  originalName  String
  fileSize      Int
  status        ImportStatus @default(PROCESSING)
  decksCount    Int      @default(0)
  notesCount    Int      @default(0)
  cardsCount    Int      @default(0)
  mediaCount    Int      @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  decks         Deck[]
  notes         Note[]
  cards         Card[]
  mediaFiles    MediaFile[]
}

model Deck {
  id            String   @id @default(uuid())
  ankiDeckId    String
  name          String
  description   String?
  importId      String
  import        Import   @relation(fields: [importId], references: [id], onDelete: Cascade)
  cards         Card[]
  createdAt     DateTime @default(now())
}

model NoteModel {
  id            String   @id @default(uuid())
  ankiModelId   String
  name          String
  fields        Json     // Array de nomes dos campos: ["Front", "Back", "Extra"]
  templates     Json     // Templates de card (frente/verso HTML)
  importId      String
  notes         Note[]
  createdAt     DateTime @default(now())
}

model Note {
  id            String   @id @default(uuid())
  ankiNoteId    String
  modelId       String
  model         NoteModel @relation(fields: [modelId], references: [id])
  fields        Json     // Objeto com campos nomeados: { "Front": "...", "Back": "..." }
  tags          String[]
  importId      String
  import        Import   @relation(fields: [importId], references: [id], onDelete: Cascade)
  cards         Card[]
  createdAt     DateTime @default(now())
}

model Card {
  id            String   @id @default(uuid())
  ankiCardId    String
  noteId        String
  note          Note     @relation(fields: [noteId], references: [id], onDelete: Cascade)
  deckId        String
  deck          Deck     @relation(fields: [deckId], references: [id], onDelete: Cascade)
  ordinal       Int
  cardType      Int      // 0=new, 1=learning, 2=review
  queue         Int
  dueDate       Int?
  interval      Int?
  easeFactor    Int?
  repetitions   Int      @default(0)
  lapses        Int      @default(0)
  importId      String
  import        Import   @relation(fields: [importId], references: [id], onDelete: Cascade)
  createdAt     DateTime @default(now())
}

model MediaFile {
  id            String   @id @default(uuid())
  ankiIndex     String   // Índice original no arquivo media ("0", "1", etc.)
  originalName  String   // Nome original do arquivo
  mimeType      String
  sizeKb        Int
  storageUrl    String   // URL no S3 ou caminho local
  type          MediaType
  importId      String
  import        Import   @relation(fields: [importId], references: [id], onDelete: Cascade)
  createdAt     DateTime @default(now())
}

enum ImportStatus {
  PROCESSING
  COMPLETED
  FAILED
}

enum MediaType {
  IMAGE
  AUDIO
  VIDEO
  OTHER
}
```

---

## Endpoints da API

### Upload e Extração

| Método | Rota | Descrição |
| --- | --- | --- |
| `POST` | `/api/upload` | Recebe arquivo `.apkg`, extrai e persiste tudo. Retorna o `importId` |
| `GET` | `/api/imports` | Lista todos os imports realizados |
| `GET` | `/api/imports/:id` | Detalhes de um import (status, contagens) |
| `DELETE` | `/api/imports/:id` | Remove um import e todos os dados associados |

### Decks

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/api/imports/:importId/decks` | Lista decks de um import |
| `GET` | `/api/decks/:id` | Detalhes de um deck com contagem de cards |

### Cards e Notas

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/api/imports/:importId/cards` | Lista todos os cards (paginado, filtro por deck) |
| `GET` | `/api/cards/:id` | Detalhes de um card com nota e campos |
| `GET` | `/api/imports/:importId/notes` | Lista todas as notas (paginado, filtro por tags) |
| `GET` | `/api/notes/:id` | Detalhes de uma nota com todos os campos |

### Mídia

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/api/imports/:importId/media` | Lista todas as mídias (filtro por tipo) |
| `GET` | `/api/media/:id` | Retorna/serve o arquivo de mídia |
| `GET` | `/api/media/:id/info` | Metadados da mídia (tipo, tamanho, nome) |

### Export (JSON completo)

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/api/imports/:importId/export` | Retorna JSON completo estruturado com tudo |
| `GET` | `/api/imports/:importId/export?format=csv` | Retorna CSV dos cards |

---

## Fluxo de Extração (ExtractionService)

```
1. Recebe arquivo .apkg via POST /upload
   │
2. Salva arquivo temporário no disco
   │
3. Cria registro Import no banco (status: PROCESSING)
   │
4. Extrai o ZIP (.apkg)
   │
   ├── 4a. Localiza collection.anki2 ou collection.anki21
   │
   ├── 4b. Localiza arquivo "media" (JSON de mapeamento)
   │
   └── 4c. Localiza arquivos de mídia (0, 1, 2, ...)
   │
5. Abre o SQLite com better-sqlite3
   │
   ├── 5a. Lê tabela "col" → extrai modelos e decks
   │       - Parseia JSON de models → cria NoteModel para cada
   │       - Parseia JSON de decks → cria Deck para cada
   │
   ├── 5b. Lê tabela "notes" → cria Note para cada
   │       - Splitta flds por \x1f
   │       - Mapeia campos pelos nomes do NoteModel correspondente
   │       - Parseia tags (split por espaço)
   │       - Detecta referências a mídia no HTML dos campos
   │         (regex: <img src="nome.jpg"> e [sound:nome.mp3])
   │
   ├── 5c. Lê tabela "cards" → cria Card para cada
   │       - Associa com Note e Deck pelos IDs do Anki
   │
   └── 5d. Processa mídias
           - Lê arquivo "media" (JSON de mapeamento)
           - Para cada arquivo de mídia:
             - Detecta MIME type
             - Faz upload para S3 ou salva localmente
             - Cria registro MediaFile no banco
   │
6. Atualiza Import (status: COMPLETED, contagens)
   │
7. Limpa arquivos temporários
   │
8. Retorna importId ao cliente
```

---

## Exemplo de retorno do Export JSON

```json
{
  "import": {
    "id": "uuid-do-import",
    "originalName": "English_Vocabulary.apkg",
    "status": "COMPLETED",
    "decksCount": 3,
    "notesCount": 450,
    "cardsCount": 900,
    "mediaCount": 120,
    "createdAt": "2026-03-15T10:00:00Z"
  },
  "decks": [
    {
      "id": "uuid-deck",
      "name": "English::Vocabulary::Advanced",
      "cardsCount": 300,
      "cards": [
        {
          "id": "uuid-card",
          "ordinal": 0,
          "cardType": "new",
          "note": {
            "id": "uuid-note",
            "model": "Basic (and reversed card)",
            "fields": {
              "Front": "What does <b>ubiquitous</b> mean?",
              "Back": "Present, appearing, or found everywhere.",
              "Example": "Smartphones have become <i>ubiquitous</i> in modern life.",
              "Audio": "[sound:ubiquitous_pronunciation.mp3]"
            },
            "tags": ["vocabulary", "advanced", "adjectives"],
            "media": [
              {
                "id": "uuid-media",
                "originalName": "ubiquitous_pronunciation.mp3",
                "type": "AUDIO",
                "url": "https://s3.../ubiquitous_pronunciation.mp3"
              }
            ]
          }
        }
      ]
    }
  ],
  "media": [
    {
      "id": "uuid-media",
      "originalName": "ubiquitous_pronunciation.mp3",
      "mimeType": "audio/mpeg",
      "type": "AUDIO",
      "sizeKb": 45,
      "url": "https://s3.../ubiquitous_pronunciation.mp3"
    },
    {
      "id": "uuid-media-2",
      "originalName": "example_image.jpg",
      "mimeType": "image/jpeg",
      "type": "IMAGE",
      "sizeKb": 230,
      "url": "https://s3.../example_image.jpg"
    }
  ]
}
```

---

## Lógica de Parse dos Campos (anki-parser.util.ts)

### Separar campos por nome

```typescript
function parseNoteFields(
  rawFields: string, // "pergunta\x1fresposta\x1fextra"
  modelFields: string[] // ["Front", "Back", "Extra"]
): Record<string, string> {
  const values = rawFields.split('\x1f');
  const result: Record<string, string> = {};
  modelFields.forEach((fieldName, index) => {
    result[fieldName] = values[index] || '';
  });
  return result;
}
```

### Detectar mídias referenciadas nos campos

```typescript
function extractMediaReferences(html: string): string[] {
  const refs: string[] = [];

  // Imagens: <img src="nome.jpg">
  const imgRegex = /<img[^>]+src="([^"]+)"/g;
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    refs.push(match[1]);
  }

  // Áudios: [sound:nome.mp3]
  const soundRegex = /\[sound:([^\]]+)\]/g;
  while ((match = soundRegex.exec(html)) !== null) {
    refs.push(match[1]);
  }

  return refs;
}
```

### Detectar tipo de mídia

```typescript
function detectMediaType(filename: string): MediaType {
  const ext = filename.split('.').pop()?.toLowerCase();
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
  const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'];
  const videoExts = ['mp4', 'webm', 'avi', 'mkv', 'mov'];

  if (imageExts.includes(ext)) return 'IMAGE';
  if (audioExts.includes(ext)) return 'AUDIO';
  if (videoExts.includes(ext)) return 'VIDEO';
  return 'OTHER';
}
```

---

## Dependências (package.json)

```json
{
  "dependencies": {
    "@nestjs/common": "^10.x",
    "@nestjs/core": "^10.x",
    "@nestjs/platform-express": "^10.x",
    "@prisma/client": "^5.x",
    "adm-zip": "^0.5.x",
    "better-sqlite3": "^11.x",
    "multer": "^1.4.x",
    "mime-types": "^2.1.x",
    "sharp": "^0.33.x",
    "@aws-sdk/client-s3": "^3.x"
  },
  "devDependencies": {
    "prisma": "^5.x",
    "@types/adm-zip": "^0.5.x",
    "@types/better-sqlite3": "^7.x",
    "@types/multer": "^1.4.x",
    "@types/mime-types": "^2.1.x"
  }
}
```

---

## Etapas de Implementação

| Etapa | Descrição | Prioridade |
| --- | --- | --- |
| 1 | Setup do projeto NestJS + Prisma + PostgreSQL | Alta |
| 2 | Schema Prisma + migrations | Alta |
| 3 | Módulo de Upload (Multer, receber .apkg) | Alta |
| 4 | ExtractionService (unzip + leitura do SQLite) | Alta |
| 5 | Parse da tabela `col` (modelos e decks) | Alta |
| 6 | Parse da tabela `notes` (campos nomeados + tags) | Alta |
| 7 | Parse da tabela `cards` (associação com notes e decks) | Alta |
| 8 | Processamento de mídias (mapeamento + upload S3/local) | Alta |
| 9 | Endpoints de listagem (decks, cards, notes, media) | Média |
| 10 | Endpoint de export JSON completo | Média |
| 11 | Endpoint de export CSV | Baixa |
| 12 | Tratamento de erros e edge cases | Média |
| 13 | Testes unitários e de integração | Média |

---

## Edge Cases e Cuidados

- Arquivos `.apkg` podem conter `collection.anki2` (formato antigo) ou `collection.anki21` (formato novo) — a API deve suportar ambos
- O formato `.anki21` usa um schema SQLite ligeiramente diferente — verificar a versão antes de parsear
- Campos HTML podem conter tags complexas (cloze deletions: `{{c1::texto}}`, MathJax: `\(...\)`)
- Mídias podem estar referenciadas mas não existir no ZIP (mídia deletada)
- Nomes de deck usam `::` como separador de hierarquia (ex: `Inglês::Vocabulário::Avançado`)
- O arquivo `media` pode não existir se não houver mídias
- Arquivos muito grandes devem ser processados de forma assíncrona (queue com Bull/Redis)
