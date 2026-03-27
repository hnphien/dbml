CREATE SCHEMA "schemaB";

CREATE SCHEMA "ecommerce";

CREATE SCHEMA "schemaA";

CREATE TABLE "users" (
  "id" int PRIMARY KEY,
  "name" varchar
);

CREATE TABLE "products" (
  "id" int PRIMARY KEY,
  "name" varchar
);

CREATE TABLE "ecommerce"."users" (
  "id" int PRIMARY KEY,
  "name" varchar
);

CREATE TABLE "schemaA"."products" (
  "id" int PRIMARY KEY,
  "name" varchar
);

CREATE TABLE "schemaA"."locations" (
  "id" int PRIMARY KEY,
  "name" varchar
);

ALTER TABLE "schemaA"."products" ADD FOREIGN KEY ("name") REFERENCES "ecommerce"."users" ("id");

ALTER TABLE "schemaA"."locations" ADD FOREIGN KEY ("name") REFERENCES "users" ("id");

ALTER TABLE "ecommerce"."users" ADD FOREIGN KEY ("id") REFERENCES "users" ("id");

ALTER TABLE "ecommerce"."users" ADD CONSTRAINT "name_optional" FOREIGN KEY ("id") REFERENCES "users" ("name");
