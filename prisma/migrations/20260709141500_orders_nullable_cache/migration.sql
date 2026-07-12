-- Repurpose the existing (previously unused) "orders" column as a lazily-
-- synced cache of the customer's Shopify order count.
--
-- Drop the default and NOT NULL constraint so the column can hold NULL,
-- then explicitly NULL out every existing row: their current value is
-- just the untouched default (0), not a real order count, so it must not
-- be mistaken for "confirmed zero orders". NULL is later distinguished
-- from a genuine 0 by app/layout/customers/$id/_loader.server.js (NULL
-- triggers a one-time live Shopify fetch to backfill the real count).

ALTER TABLE "Customer" ALTER COLUMN "orders" DROP DEFAULT;
ALTER TABLE "Customer" ALTER COLUMN "orders" DROP NOT NULL;
UPDATE "Customer" SET "orders" = NULL;
