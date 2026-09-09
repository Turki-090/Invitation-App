import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  assetUploadFieldsSchema,
  listAssetsQuerySchema,
  type AssetUploadFields,
  type ListAssetsQuery,
  type ListAssetsResponse,
  type StoredAsset,
} from "@dawah/api-contract";
import type { Response } from "express";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { ZodValidationPipe } from "../shared/zod-validation.pipe";
import { AssetsService } from "./assets.service";

const absoluteAssetUploadSafetyLimit = 16 * 1024 * 1024;

@UseGuards(AuthGuard)
@Controller("events/:eventId/assets")
export class AssetsController {
  public constructor(
    @Inject(AssetsService) private readonly assets: AssetsService,
  ) {}

  @Get()
  public list(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Query(new ZodValidationPipe(listAssetsQuerySchema)) query: ListAssetsQuery,
  ): Promise<ListAssetsResponse> {
    return this.assets.list(request.user, eventId, query);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: absoluteAssetUploadSafetyLimit, files: 1, fields: 4 },
    }),
  )
  public upload(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Body(new ZodValidationPipe(assetUploadFieldsSchema))
    fields: AssetUploadFields,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<StoredAsset> {
    return this.assets.upload(request.user, eventId, fields, file);
  }

  @Get(":assetId/content")
  public async content(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Param("assetId", new ParseUUIDPipe({ version: "4" })) assetId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const object = await this.assets.content(request.user, eventId, assetId);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("Content-Type", object.mediaType);
    response.setHeader("Content-Length", String(object.body.byteLength));
    response.setHeader("Content-Disposition", "inline");
    return new StreamableFile(Buffer.from(object.body));
  }

  @Post(":assetId/archive")
  @HttpCode(HttpStatus.OK)
  public archive(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Param("assetId", new ParseUUIDPipe({ version: "4" })) assetId: string,
  ): Promise<StoredAsset> {
    return this.assets.archive(request.user, eventId, assetId);
  }
}
