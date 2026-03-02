import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWeeklyOrderLimitsAndExceptions1768000000000
  implements MigrationInterface
{
  name = 'AddWeeklyOrderLimitsAndExceptions1768000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sectors"
      ADD COLUMN IF NOT EXISTS "maxOrdersPerWeek" integer DEFAULT 1;
    `);

    await queryRunner.query(`
      UPDATE "sectors"
      SET "maxOrdersPerWeek" = 1
      WHERE "maxOrdersPerWeek" IS NULL;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_weekly_order_exceptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "weekStartDate" date NOT NULL,
        "extraOrders" integer NOT NULL DEFAULT 1,
        "reason" text,
        "grantedByUserId" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_weekly_order_exceptions_id" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_weekly_order_exceptions_user_week"
      ON "user_weekly_order_exceptions" ("userId", "weekStartDate");
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE table_name = 'user_weekly_order_exceptions'
            AND constraint_name = 'FK_user_weekly_order_exceptions_userId'
        ) THEN
          ALTER TABLE "user_weekly_order_exceptions"
          ADD CONSTRAINT "FK_user_weekly_order_exceptions_userId"
          FOREIGN KEY ("userId") REFERENCES "users"("id")
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
          WHERE table_name = 'user_weekly_order_exceptions'
            AND constraint_name = 'FK_user_weekly_order_exceptions_grantedByUserId'
        ) THEN
          ALTER TABLE "user_weekly_order_exceptions"
          ADD CONSTRAINT "FK_user_weekly_order_exceptions_grantedByUserId"
          FOREIGN KEY ("grantedByUserId") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END$$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_weekly_order_exceptions"
      DROP CONSTRAINT IF EXISTS "FK_user_weekly_order_exceptions_grantedByUserId";
    `);

    await queryRunner.query(`
      ALTER TABLE "user_weekly_order_exceptions"
      DROP CONSTRAINT IF EXISTS "FK_user_weekly_order_exceptions_userId";
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_user_weekly_order_exceptions_user_week";
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "user_weekly_order_exceptions";
    `);

    await queryRunner.query(`
      ALTER TABLE "sectors"
      DROP COLUMN IF EXISTS "maxOrdersPerWeek";
    `);
  }
}
