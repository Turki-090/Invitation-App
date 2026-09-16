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
  UseGuards,
} from "@nestjs/common";
import {
  createExportSchema,
  exportDownloadQuerySchema,
  listExportJobsQuerySchema,
  type CreateExportInput,
  type ExportDownloadQuery,
  type ExportJob,
  type ListExportJobsQuery,
  type ListExportJobsResponse,
} from "@dawah/api-contract";
import type { Response } from "express";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { ZodValidationPipe } from "../shared/zod-validation.pipe";
import { ExportsService } from "./exports.service";

@UseGuards(AuthGuard)
@Controller("events/:eventId/exports")
export class ExportsController {
  public constructor(
    @Inject(ExportsService) private readonly exports: ExportsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  public create(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Body(new ZodValidationPipe(createExportSchema)) input: CreateExportInput,
  ): Promise<ExportJob> {
    return this.exports.create(request.user, eventId, input);
  }

  @Get()
  public list(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Query(new ZodValidationPipe(listExportJobsQuerySchema))
    query: ListExportJobsQuery,
  ): Promise<ListExportJobsResponse> {
    return this.exports.list(request.user, eventId, query);
  }

  @Get(":exportJobId")
  public get(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Param("exportJobId", new ParseUUIDPipe({ version: "4" }))
    exportJobId: string,
  ): Promise<ExportJob> {
    return this.exports.get(request.user, eventId, exportJobId);
  }

  @Get(":exportJobId/download")
  public async download(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Param("exportJobId", new ParseUUIDPipe({ version: "4" }))
    exportJobId: string,
    @Query(new ZodValidationPipe(exportDownloadQuerySchema))
    query: ExportDownloadQuery,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.exports.download(
      request.user,
      eventId,
      exportJobId,
      query,
    );
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("Content-Type", file.contentType);
    response.setHeader("Content-Length", String(file.body.byteLength));
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.filename.replaceAll('"', "")}"`,
    );
    return new StreamableFile(Buffer.from(file.body));
  }
}

