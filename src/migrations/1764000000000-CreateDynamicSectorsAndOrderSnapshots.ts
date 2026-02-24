import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDynamicSectorsAndOrderSnapshots1764000000000
  implements MigrationInterface
{
  name = 'CreateDynamicSectorsAndOrderSnapshots1764000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sectors" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "title" text NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "preparationWeekday" integer NOT NULL DEFAULT 1,
        "maxTotalKg" integer,
        "maxItems" integer,
        "allowAllProducts" boolean NOT NULL DEFAULT true,
        "allowedProductSlugs" text[] NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sectors_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_sectors_title" UNIQUE ("title")
      );
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "sectorId" uuid;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'sector'
        ) THEN
          INSERT INTO "sectors" ("title")
          SELECT DISTINCT TRIM(("sector")::text)
          FROM "users"
          WHERE "sector" IS NOT NULL
            AND TRIM(("sector")::text) <> ''
            AND NOT EXISTS (
              SELECT 1
              FROM "sectors" s
              WHERE LOWER(s."title") = LOWER(TRIM(("users"."sector")::text))
            );

          UPDATE "users" u
          SET "sectorId" = s."id"
          FROM "sectors" s
          WHERE u."sectorId" IS NULL
            AND u."sector" IS NOT NULL
            AND LOWER(s."title") = LOWER(TRIM((u."sector")::text));

          ALTER TABLE "users" DROP COLUMN "sector";
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."users_sector_enum";
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE table_name = 'users'
            AND constraint_name = 'FK_users_sectorId'
        ) THEN
          ALTER TABLE "users"
          ADD CONSTRAINT "FK_users_sectorId"
          FOREIGN KEY ("sectorId") REFERENCES "sectors"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "sectorIdSnapshot" uuid;
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "sectorTitleSnapshot" text;
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "preparationWeekdaySnapshot" integer;
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "preparationDate" date;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
      DROP COLUMN IF EXISTS "preparationDate";
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      DROP COLUMN IF EXISTS "preparationWeekdaySnapshot";
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      DROP COLUMN IF EXISTS "sectorTitleSnapshot";
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      DROP COLUMN IF EXISTS "sectorIdSnapshot";
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP CONSTRAINT IF EXISTS "FK_users_sectorId";
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "sectorId";
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "sectors";
    `);
  }
}
