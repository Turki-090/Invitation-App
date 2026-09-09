import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ApiEnvironment } from "@dawah/config";
import { createS3ObjectStorage } from "@dawah/storage";
import { PRIVATE_OBJECT_STORAGE } from "./storage.constants";

@Module({
  providers: [
    {
      provide: PRIVATE_OBJECT_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<ApiEnvironment, true>) =>
        createS3ObjectStorage({
          endpoint: config.get("STORAGE_ENDPOINT", { infer: true }),
          region: config.get("STORAGE_REGION", { infer: true }),
          credentials: {
            accessKeyId: config.get("STORAGE_ACCESS_KEY_ID", { infer: true }),
            secretAccessKey: config.get("STORAGE_SECRET_ACCESS_KEY", {
              infer: true,
            }),
          },
          forcePathStyle: config.get("STORAGE_FORCE_PATH_STYLE", {
            infer: true,
          }),
        }),
    },
  ],
  exports: [PRIVATE_OBJECT_STORAGE],
})
export class StorageModule {}
