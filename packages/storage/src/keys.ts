import { randomUUID } from "node:crypto";
import {
  extensionFromFilename,
  validateKeySegment,
  validateObjectKey,
} from "./validation";

export const storageKeyScopes = {
  imports: "imports",
  eventImages: "event-images",
  invitationAssets: "invitation-assets",
  generatedFiles: "generated-files",
} as const;

export type StorageKeyScope =
  (typeof storageKeyScopes)[keyof typeof storageKeyScopes];

export type ObjectIdGenerator = () => string;

export interface ImportObjectKeyInput {
  readonly eventId: string;
  readonly importId: string;
  readonly filename: string;
}

export interface EventImageObjectKeyInput {
  readonly eventId: string;
  readonly filename: string;
}

export interface InvitationAssetObjectKeyInput {
  readonly eventId: string;
  readonly templateId: string;
  readonly filename: string;
}

export interface GeneratedFileObjectKeyInput {
  readonly eventId: string;
  readonly kind: string;
  readonly filename: string;
}

export interface StorageKeyFactory {
  importFile(input: ImportObjectKeyInput): string;
  eventImage(input: EventImageObjectKeyInput): string;
  invitationAsset(input: InvitationAssetObjectKeyInput): string;
  generatedFile(input: GeneratedFileObjectKeyInput): string;
}

/**
 * Creates collision-resistant keys without copying user-provided basename data
 * into storage paths. Supplying an ID generator makes tests deterministic.
 */
export function createStorageKeyFactory(
  generateObjectId: ObjectIdGenerator = randomUUID,
): StorageKeyFactory {
  const generatedLeaf = (filename: string): string => {
    const objectId = validateKeySegment(
      generateObjectId(),
      "Generated object ID",
    );
    return `${objectId}.${extensionFromFilename(filename)}`;
  };

  return Object.freeze({
    importFile(input: ImportObjectKeyInput): string {
      return makeKey(
        storageKeyScopes.imports,
        validateKeySegment(input.eventId, "Event ID"),
        validateKeySegment(input.importId, "Import ID"),
        generatedLeaf(input.filename),
      );
    },

    eventImage(input: EventImageObjectKeyInput): string {
      return makeKey(
        storageKeyScopes.eventImages,
        validateKeySegment(input.eventId, "Event ID"),
        generatedLeaf(input.filename),
      );
    },

    invitationAsset(input: InvitationAssetObjectKeyInput): string {
      return makeKey(
        storageKeyScopes.invitationAssets,
        validateKeySegment(input.eventId, "Event ID"),
        validateKeySegment(input.templateId, "Template ID"),
        generatedLeaf(input.filename),
      );
    },

    generatedFile(input: GeneratedFileObjectKeyInput): string {
      return makeKey(
        storageKeyScopes.generatedFiles,
        validateKeySegment(input.eventId, "Event ID"),
        validateKeySegment(input.kind, "Generated file kind"),
        generatedLeaf(input.filename),
      );
    },
  });
}

const defaultStorageKeyFactory = createStorageKeyFactory();

export function generateImportObjectKey(input: ImportObjectKeyInput): string {
  return defaultStorageKeyFactory.importFile(input);
}

export function generateEventImageObjectKey(
  input: EventImageObjectKeyInput,
): string {
  return defaultStorageKeyFactory.eventImage(input);
}

export function generateInvitationAssetObjectKey(
  input: InvitationAssetObjectKeyInput,
): string {
  return defaultStorageKeyFactory.invitationAsset(input);
}

export function generateGeneratedFileObjectKey(
  input: GeneratedFileObjectKeyInput,
): string {
  return defaultStorageKeyFactory.generatedFile(input);
}

/** @deprecated Prefer the purpose-explicit generateGeneratedFileObjectKey name. */
export const generateFileObjectKey = generateGeneratedFileObjectKey;

function makeKey(...segments: readonly string[]): string {
  return validateObjectKey(segments.join("/"));
}
