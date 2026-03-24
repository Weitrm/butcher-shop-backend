import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropLegacyRoleAndSectorArrayColumns1771000000000
  implements MigrationInterface
{
  name = 'DropLegacyRoleAndSectorArrayColumns1771000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "roles";
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
      DROP COLUMN IF EXISTS "allowedSectorIds";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "roles" text[] NOT NULL DEFAULT '{user}';
    `);

    await queryRunner.query(`
      UPDATE "users" u
      SET "roles" = COALESCE(
        (
          SELECT ARRAY_AGG(DISTINCT ur."role")
          FROM "user_roles" ur
          WHERE ur."userId" = u."id"
        ),
        ARRAY['user']::text[]
      );
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "allowedSectorIds" uuid[] NOT NULL DEFAULT '{}';
    `);

    await queryRunner.query(`
      UPDATE "products" p
      SET "allowedSectorIds" = COALESCE(
        (
          SELECT ARRAY_AGG(DISTINCT psv."sectorId")
          FROM "product_sector_visibility" psv
          WHERE psv."productId" = p."id"
        ),
        ARRAY[]::uuid[]
      );
    `);
  }
}
