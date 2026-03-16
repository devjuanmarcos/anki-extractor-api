-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'AUDIO', 'VIDEO', 'OTHER');

-- CreateTable
CREATE TABLE "imports" (
    "id" TEXT NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PROCESSING',
    "failure_reason" TEXT,
    "decks_count" INTEGER NOT NULL DEFAULT 0,
    "notes_count" INTEGER NOT NULL DEFAULT 0,
    "cards_count" INTEGER NOT NULL DEFAULT 0,
    "media_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decks" (
    "id" TEXT NOT NULL,
    "anki_deck_id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "import_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_models" (
    "id" TEXT NOT NULL,
    "anki_model_id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "fields" JSONB NOT NULL,
    "templates" JSONB NOT NULL,
    "import_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "anki_note_id" VARCHAR(64) NOT NULL,
    "model_id" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "import_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cards" (
    "id" TEXT NOT NULL,
    "anki_card_id" VARCHAR(64) NOT NULL,
    "note_id" TEXT NOT NULL,
    "deck_id" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "card_type" INTEGER NOT NULL,
    "queue" INTEGER NOT NULL,
    "due_date" INTEGER,
    "interval_value" INTEGER,
    "ease_factor" INTEGER,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "import_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_files" (
    "id" TEXT NOT NULL,
    "anki_index" VARCHAR(32) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(160) NOT NULL,
    "size_kb" INTEGER NOT NULL,
    "storage_url" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "import_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imports_status_idx" ON "imports"("status");

-- CreateIndex
CREATE INDEX "imports_created_at_idx" ON "imports"("created_at");

-- CreateIndex
CREATE INDEX "decks_import_id_idx" ON "decks"("import_id");

-- CreateIndex
CREATE INDEX "decks_import_id_name_idx" ON "decks"("import_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "decks_import_id_anki_deck_id_key" ON "decks"("import_id", "anki_deck_id");

-- CreateIndex
CREATE INDEX "note_models_import_id_idx" ON "note_models"("import_id");

-- CreateIndex
CREATE UNIQUE INDEX "note_models_import_id_anki_model_id_key" ON "note_models"("import_id", "anki_model_id");

-- CreateIndex
CREATE INDEX "notes_import_id_idx" ON "notes"("import_id");

-- CreateIndex
CREATE INDEX "notes_import_id_model_id_idx" ON "notes"("import_id", "model_id");

-- CreateIndex
CREATE UNIQUE INDEX "notes_import_id_anki_note_id_key" ON "notes"("import_id", "anki_note_id");

-- CreateIndex
CREATE INDEX "cards_import_id_idx" ON "cards"("import_id");

-- CreateIndex
CREATE INDEX "cards_import_id_deck_id_idx" ON "cards"("import_id", "deck_id");

-- CreateIndex
CREATE INDEX "cards_import_id_note_id_idx" ON "cards"("import_id", "note_id");

-- CreateIndex
CREATE UNIQUE INDEX "cards_import_id_anki_card_id_key" ON "cards"("import_id", "anki_card_id");

-- CreateIndex
CREATE INDEX "media_files_import_id_idx" ON "media_files"("import_id");

-- CreateIndex
CREATE INDEX "media_files_import_id_type_idx" ON "media_files"("import_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "media_files_import_id_anki_index_key" ON "media_files"("import_id", "anki_index");

-- AddForeignKey
ALTER TABLE "decks" ADD CONSTRAINT "decks_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_models" ADD CONSTRAINT "note_models_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "note_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "decks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
