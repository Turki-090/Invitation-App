import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  confirmImportSchema,
  getImportJobQuerySchema,
  listImportJobsQuerySchema,
  updateImportMappingSchema,
  updateImportRowSchema,
  type ConfirmImportInput,
  type ConfirmImportResult,
  type GetImportJobQuery,
  type ImportJobDetailResponse,
  type ImportJobSummary,
  type ImportLimits,
  type ListImportJobsQuery,
  type ListImportJobsResponse,
  type UpdateImportMappingInput,
  type UpdateImportRowInput,
} from "@dawah/api-contract";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { ZodValidationPipe } from "../shared/zod-validation.pipe";
import { ImportsService } from "./imports.service";

const absoluteUploadSafetyLimit = 16 * 1024 * 1024;

@UseGuards(AuthGuard)
@Controller("events/:eventId/imports")
export class ImportsController {
  public constructor(
    @Inject(ImportsService) private readonly imports: ImportsService,
  ) {}

  @Get("limits")
  public limits(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
  ): Promise<ImportLimits> {
    return this.imports.limits(request.user, eventId);
  }

  @Get()
  public list(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Query(new ZodValidationPipe(listImportJobsQuerySchema))
    query: ListImportJobsQuery,
  ): Promise<ListImportJobsResponse> {
    return this.imports.list(request.user, eventId, query);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: absoluteUploadSafetyLimit, files: 1, fields: 4 },
    }),
  )
  public upload(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ImportJobSummary> {
    return this.imports.upload(request.user, eventId, file);
  }

  @Get(":importJobId")
  public get(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Param("importJobId", new ParseUUIDPipe({ version: "4" }))
    importJobId: string,
    @Query(new ZodValidationPipe(getImportJobQuerySchema))
    query: GetImportJobQuery,
  ): Promise<ImportJobDetailResponse> {
    return this.imports.get(request.user, eventId, importJobId, query);
  }

  @Patch(":importJobId/mapping")
  public updateMapping(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Param("importJobId", new ParseUUIDPipe({ version: "4" }))
    importJobId: string,
    @Body(new ZodValidationPipe(updateImportMappingSchema))
    input: UpdateImportMappingInput,
  ): Promise<ImportJobSummary> {
    return this.imports.updateMapping(
      request.user,
      eventId,
      importJobId,
      input,
    );
  }

  @Patch(":importJobId/rows/:rowId")
  public updateRow(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Param("importJobId", new ParseUUIDPipe({ version: "4" }))
    importJobId: string,
    @Param("rowId", new ParseUUIDPipe({ version: "4" })) rowId: string,
    @Body(new ZodValidationPipe(updateImportRowSchema))
    input: UpdateImportRowInput,
  ): Promise<ImportJobSummary> {
    return this.imports.updateRow(
      request.user,
      eventId,
      importJobId,
      rowId,
      input,
    );
  }

  @Post(":importJobId/confirm")
  @HttpCode(HttpStatus.OK)
  public confirm(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Param("importJobId", new ParseUUIDPipe({ version: "4" }))
    importJobId: string,
    @Body(new ZodValidationPipe(confirmImportSchema)) input: ConfirmImportInput,
  ): Promise<ConfirmImportResult> {
    return this.imports.confirm(request.user, eventId, importJobId, input);
  }

  @Post(":importJobId/cancel")
  @HttpCode(HttpStatus.OK)
  public cancel(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Param("importJobId", new ParseUUIDPipe({ version: "4" }))
    importJobId: string,
  ): Promise<ImportJobSummary> {
    return this.imports.cancel(request.user, eventId, importJobId);
  }
}
