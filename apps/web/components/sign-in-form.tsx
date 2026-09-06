"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Field, Input } from "@dawah/ui";
import { isValidPhoneNumber } from "libphonenumber-js";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { developmentAuthBypassEnabled } from "@/lib/api";
import { getSupabaseClient } from "@/lib/supabase";
import type { AppLocale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";

interface SignInFormProps {
  locale: AppLocale;
  copy: Dictionary["auth"];
}

export function SignInForm({ locale, copy }: SignInFormProps) {
  const router = useRouter();
  const [phone, setPhone] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const phoneSchema = z.object({
    phone: z
      .string()
      .trim()
      .refine(
        (value) => value.startsWith("+") && isValidPhoneNumber(value),
        copy.phoneValidation,
      ),
  });
  const codeSchema = z.object({
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, copy.codeValidation),
  });
  type PhoneValues = z.infer<typeof phoneSchema>;
  type CodeValues = z.infer<typeof codeSchema>;
  const phoneForm = useForm<PhoneValues>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: "+966" },
  });
  const codeForm = useForm<CodeValues>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: "" },
  });

  const requestCode = phoneForm.handleSubmit(
    async ({ phone: submittedPhone }) => {
      setServerError(null);
      const supabase = getSupabaseClient();
      if (!supabase) {
        setServerError(copy.providerMissing);
        return;
      }
      const { error } = await supabase.auth.signInWithOtp({
        phone: submittedPhone,
        options: { shouldCreateUser: true },
      });
      if (error) {
        setServerError(copy.sendFailed);
        return;
      }
      setPhone(submittedPhone);
    },
  );

  const verifyCode = codeForm.handleSubmit(async ({ code }) => {
    if (!phone) return;
    setServerError(null);
    const supabase = getSupabaseClient();
    if (!supabase) {
      setServerError(copy.providerMissingShort);
      return;
    }
    const { error } = await supabase.auth.verifyOtp({
      phone,
      token: code,
      type: "sms",
    });
    if (error) {
      setServerError(copy.invalidCode);
      return;
    }
    router.push(`/${locale}/events`);
  });

  if (phone) {
    return (
      <form className="auth-form" onSubmit={verifyCode}>
        <Field
          id="code"
          label={copy.codeLabel}
          error={codeForm.formState.errors.code?.message}
          hint={copy.codeHint.replace("{phone}", phone)}
          required
        >
          <Input
            {...codeForm.register("code")}
            autoComplete="one-time-code"
            className="phone"
            id="code"
            inputMode="numeric"
            invalid={Boolean(codeForm.formState.errors.code)}
            maxLength={6}
            placeholder="000000"
          />
        </Field>
        {serverError ? (
          <p className="form-error" role="alert">
            {serverError}
          </p>
        ) : null}
        <Button
          fullWidth
          loading={codeForm.formState.isSubmitting}
          size="lg"
          type="submit"
        >
          {copy.verifyCode}
        </Button>
        <Button
          fullWidth
          onClick={() => {
            setPhone(null);
            setServerError(null);
            codeForm.reset();
          }}
          size="lg"
          variant="ghost"
        >
          {copy.changePhone}
        </Button>
      </form>
    );
  }

  if (developmentAuthBypassEnabled) {
    return (
      <div className="auth-form">
        <div className="development-access-note" role="note">
          <strong>{copy.developmentTitle}</strong>
          <span>{copy.developmentNote}</span>
        </div>
        <Button
          fullWidth
          onClick={() => router.push(`/${locale}/events`)}
          size="lg"
        >
          {copy.developmentLogin}
        </Button>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={requestCode}>
      <Field
        id="phone"
        label={copy.phoneLabel}
        error={phoneForm.formState.errors.phone?.message}
        hint={copy.phoneHint}
        required
      >
        <Input
          {...phoneForm.register("phone")}
          autoComplete="tel"
          className="phone"
          id="phone"
          icon="phone"
          inputMode="tel"
          invalid={Boolean(phoneForm.formState.errors.phone)}
        />
      </Field>
      {serverError ? (
        <p className="form-error" role="alert">
          {serverError}
        </p>
      ) : null}
      <Button
        fullWidth
        loading={phoneForm.formState.isSubmitting}
        size="lg"
        type="submit"
      >
        {copy.sendCode}
      </Button>
    </form>
  );
}
