import type arSA from "./ar-SA";
import type { AppLocale } from "../config";

type StringShape<Value> = Value extends string
  ? string
  : Value extends readonly unknown[]
    ? { [Index in keyof Value]: StringShape<Value[Index]> }
    : { [Key in keyof Value]: StringShape<Value[Key]> };

export type Dictionary = StringShape<typeof arSA>;

const dictionaries: Record<AppLocale, () => Promise<{ default: Dictionary }>> =
  {
    "ar-SA": () => import("./ar-SA"),
    en: () => import("./en"),
  };

export async function getDictionary(locale: AppLocale): Promise<Dictionary> {
  return (await dictionaries[locale]()).default;
}
