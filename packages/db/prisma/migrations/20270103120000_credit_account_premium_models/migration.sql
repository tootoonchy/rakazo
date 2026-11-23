-- Modified by Agental: whether an organization's credits may pay for premium models. Off until set.
ALTER TABLE "model_credit_accounts" ADD COLUMN "premiumModels" BOOLEAN NOT NULL DEFAULT false;
