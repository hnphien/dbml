CREATE TABLE "orders" (
  "id" INT AUTOINCREMENT PRIMARY KEY,
  "user_id" bigint UNIQUE NOT NULL,
  "status" VARCHAR NOT NULL CHECK ("status" IN ('created', 'running', 'done', 'failure')),
  "created_at" varchar
);

CREATE TABLE "order_items" (
  "order_id" int,
  "product_id" int,
  "quantity" int DEFAULT 1
);

CREATE TABLE "products" (
  "id" int,
  "name" varchar,
  "merchant_id" int NOT NULL,
  "price" int,
  "status" VARCHAR NOT NULL CHECK ("status" IN ('Out of Stock', 'In Stock')),
  "created_at" datetime DEFAULT (now()),
  PRIMARY KEY ("id", "name")
);

CREATE TABLE "users" (
  "id" BIGINT AUTOINCREMENT PRIMARY KEY,
  "full_name" varchar,
  "email" varchar UNIQUE,
  "gender" varchar,
  "date_of_birth" varchar,
  "created_at" varchar,
  "country_code" int
);

CREATE TABLE "merchants" (
  "id" int PRIMARY KEY,
  "merchant_name" varchar,
  "country_code" int,
  "created_at" varchar,
  "admin_id" int
);

CREATE TABLE "countries" (
  "code" int PRIMARY KEY,
  "name" varchar,
  "continent_name" varchar
);

COMMENT ON TABLE "orders" IS 'This is a note in table "orders"';

COMMENT ON COLUMN "orders"."created_at" IS 'When order created';

COMMENT ON TABLE "products" IS 'This is a note in table ''products''';

COMMENT ON TABLE "users" IS 'This is a note in table "users"';

ALTER TABLE "order_items" ADD FOREIGN KEY ("order_id") REFERENCES "orders" ("id");

ALTER TABLE "order_items" ADD FOREIGN KEY ("product_id") REFERENCES "products" ("id");

ALTER TABLE "users" ADD FOREIGN KEY ("country_code") REFERENCES "countries" ("code");

ALTER TABLE "merchants" ADD FOREIGN KEY ("country_code") REFERENCES "countries" ("code");

ALTER TABLE "products" ADD FOREIGN KEY ("merchant_id") REFERENCES "merchants" ("id");

ALTER TABLE "merchants" ADD FOREIGN KEY ("admin_id") REFERENCES "users" ("id");
