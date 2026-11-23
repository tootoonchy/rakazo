-- Modified by Agental: an organization's own daily credit cap. Null follows the deployment's default.
ALTER TABLE "model_credit_accounts" ADD COLUMN "dailyCapMicros" BIGINT;
