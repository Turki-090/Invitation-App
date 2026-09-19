-- No OTPs, phone numbers, hook bodies, signatures or provider credentials.
CREATE TABLE "otp_delivery_attempts" (
  "key" CHAR(64) PRIMARY KEY,
  "fingerprint" CHAR(64) NOT NULL,
  "http_code" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "otp_delivery_attempts_created_idx" ON "otp_delivery_attempts" ("created_at");
ALTER TABLE "otp_delivery_attempts" ENABLE ROW LEVEL SECURITY;
