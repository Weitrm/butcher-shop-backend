import { MigrationInterface, QueryRunner } from 'typeorm';

export class NormalizeUserRolesAndProductSectorVisibility1770000000000
  implements MigrationInterface
{
  name = 'NormalizeUserRolesAndProductSectorVisibility1770000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_roles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "role" text NOT NULL,
        CONSTRAINT "PK_user_roles_id" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_user_roles_user_role_unique"
      ON "user_roles" ("userId", "role");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_roles_user"
      ON "user_roles" ("userId");
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE table_name = 'user_roles'
            AND constraint_name = 'FK_user_roles_userId'
        ) THEN
          ALTER TABLE "user_roles"
          ADD CONSTRAINT "FK_user_roles_userId"
          FOREIGN KEY ("userId") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_sector_visibility" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "productId" uuid NOT NULL,
        "sectorId" uuid NOT NULL,
        CONSTRAINT "PK_product_sector_visibility_id" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_product_sector_visibility_product_sector_unique"
      ON "product_sector_visibility" ("productId", "sectorId");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_sector_visibility_product"
      ON "product_sector_visibility" ("productId");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_sector_visibility_sector"
      ON "product_sector_visibility" ("sectorId");
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE table_name = 'product_sector_visibility'
            AND constraint_name = 'FK_product_sector_visibility_productId'
        ) THEN
          ALTER TABLE "product_sector_visibility"
          ADD CONSTRAINT "FK_product_sector_visibility_productId"
          FOREIGN KEY ("productId") REFERENCES "products"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE table_name = 'product_sector_visibility'
            AND constraint_name = 'FK_product_sector_visibility_sectorId'
        ) THEN
          ALTER TABLE "product_sector_visibility"
          ADD CONSTRAINT "FK_product_sector_visibility_sectorId"
          FOREIGN KEY ("sectorId") REFERENCES "sectors"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      INSERT INTO "user_roles" ("userId", "role")
      SELECT
        u."id",
        TRIM(role_item)
      FROM "users" u
      CROSS JOIN LATERAL UNNEST(COALESCE(u."roles", ARRAY[]::text[])) AS role_item
      WHERE role_item IS NOT NULL
        AND TRIM(role_item) <> ''
      ON CONFLICT ("userId", "role") DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO "product_sector_visibility" ("productId", "sectorId")
      SELECT
        p."id",
        sector_item
      FROM "products" p
      CROSS JOIN LATERAL UNNEST(COALESCE(p."allowedSectorIds", ARRAY[]::uuid[])) AS sector_item
      INNER JOIN "sectors" s ON s."id" = sector_item
      WHERE sector_item IS NOT NULL
      ON CONFLICT ("productId", "sectorId") DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_sector_visibility"
      DROP CONSTRAINT IF EXISTS "FK_product_sector_visibility_sectorId";
    `);

    await queryRunner.query(`
      ALTER TABLE "product_sector_visibility"
      DROP CONSTRAINT IF EXISTS "FK_product_sector_visibility_productId";
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_product_sector_visibility_sector";
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_product_sector_visibility_product";
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_product_sector_visibility_product_sector_unique";
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "product_sector_visibility";
    `);

    await queryRunner.query(`
      ALTER TABLE "user_roles"
      DROP CONSTRAINT IF EXISTS "FK_user_roles_userId";
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_user_roles_user";
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_user_roles_user_role_unique";
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "user_roles";
    `);
  }
}
