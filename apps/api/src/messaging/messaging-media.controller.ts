import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Response } from "express";
import { MessagingMediaService } from "./messaging-media.service";

@Controller("messaging/media")
export class MessagingMediaController {
  public constructor(
    @Inject(MessagingMediaService)
    private readonly media: MessagingMediaService,
  ) {}

  @Get(":snapshotId")
  @SkipThrottle()
  public async content(
    @Param("snapshotId", new ParseUUIDPipe({ version: "4" }))
    snapshotId: string,
    @Query("checksum") checksum: unknown,
    @Query("expires") expires: unknown,
    @Query("signature") signature: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const object = await this.media.content(
      snapshotId,
      checksum,
      expires,
      signature,
    );
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("Content-Type", object.mediaType);
    response.setHeader("Content-Length", String(object.body.byteLength));
    response.setHeader("Content-Disposition", "inline");
    return new StreamableFile(Buffer.from(object.body));
  }
}
