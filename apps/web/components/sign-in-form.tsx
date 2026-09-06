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

const phoneSchema = z.object({
  phone: z
    .string()
    .trim()
    .refine(
      (value) => value.startsWith("+") && isValidPhoneNumber(value),
      "أدخل رقمًا صحيحًا بصيغة دولية.",
    ),
});
const codeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "أدخل رمز التحقق المكوّن من 6 أرقام."),
});
type PhoneValues = z.infer<typeof phoneSchema>;
type CodeValues = z.infer<typeof codeSchema>;

export function SignInForm() {
  const router = useRouter();
  const [phone, setPhone] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
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
        setServerError(
          "لم يتم إعداد موفر تسجيل الدخول بعد. أضف إعدادات Supabase للبيئة المحلية.",
        );
        return;
      }
      const { error } = await supabase.auth.signInWithOtp({
        phone: submittedPhone,
        options: { shouldCreateUser: true },
      });
      if (error) {
        setServerError("تعذر إرسال رمز التحقق. تحقق من الرقم وحاول مرة أخرى.");
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
      setServerError("لم يتم إعداد موفر تسجيل الدخول بعد.");
      return;
    }
    const { error } = await supabase.auth.verifyOtp({
      phone,
      token: code,
      type: "sms",
    });
    if (error) {
      setServerError("رمز التحقق غير صحيح أو انتهت صلاحيته.");
      return;
    }
    router.push("/events");
  });

  if (phone) {
    return (
      <form className="auth-form" onSubmit={verifyCode}>
        <Field
          id="code"
          label="رمز التحقق"
          error={codeForm.formState.errors.code?.message}
          hint={`أُرسل الرمز إلى ${phone}`}
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
          تأكيد الرمز
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
          تغيير رقم الجوال
        </Button>
      </form>
    );
  }

  if (developmentAuthBypassEnabled) {
    return (
      <div className="auth-form">
        <div className="development-access-note" role="note">
          <strong>بيئة اختبار محلية</strong>
          <span>تجاوز مؤقت للتحقق من رقم الجوال. لا يعمل في الإنتاج.</span>
        </div>
        <Button fullWidth onClick={() => router.push("/events")} size="lg">
          الدخول التجريبي
        </Button>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={requestCode}>
      <Field
        id="phone"
        label="رقم الجوال"
        error={phoneForm.formState.errors.phone?.message}
        hint="مثال: +9665XXXXXXXX"
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
        إرسال رمز التحقق
      </Button>
    </form>
  );
}
