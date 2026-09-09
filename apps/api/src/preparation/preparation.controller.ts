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
  UseGuards,
} from "@nestjs/common";
import {
  approveInvitationTemplateSchema,
  createInvitationTemplateSchema,
  createPreparationSnapshotsSchema,
  invitationPreviewRequestSchema,
  readinessQuerySchema,
  updateInvitationTemplateSchema,
  type ApproveInvitationTemplateInput,
  type CreateInvitationTemplateInput,
  type CreatePreparationSnapshotsInput,
  type CreatePreparationSnapshotsResult,
  type InvitationPreview,
  type InvitationPreviewRequest,
  type InvitationTemplate,
  type ListInvitationTemplatesResponse,
  type ReadinessQuery,
  type ReadinessResponse,
  type UpdateInvitationTemplateInput,
} from "@dawah/api-contract";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { ZodValidationPipe } from "../shared/zod-validation.pipe";
import { PreparationService } from "./preparation.service";

@UseGuards(AuthGuard)
@Controller("events/:eventId/templates")
export class TemplatesController {
  public constructor(
    @Inject(PreparationService)
    private readonly preparation: PreparationService,
  ) {}

  @Get()
  public list(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
  ): Promise<ListInvitationTemplatesResponse> {
    return this.preparation.listTemplates(request.user, eventId);
  }

  @Post()
  public create(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Body(new ZodValidationPipe(createInvitationTemplateSchema))
    input: CreateInvitationTemplateInput,
  ): Promise<InvitationTemplate> {
    return this.preparation.createTemplate(request.user, eventId, input);
  }

  @Patch(":templateId")
  public update(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Param("templateId", new ParseUUIDPipe({ version: "4" }))
    templateId: string,
    @Body(new ZodValidationPipe(updateInvitationTemplateSchema))
    input: UpdateInvitationTemplateInput,
  ): Promise<InvitationTemplate> {
    return this.preparation.updateTemplate(
      request.user,
      eventId,
      templateId,
      input,
    );
  }

  @Post(":templateId/approve")
  @HttpCode(HttpStatus.OK)
  public approve(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Param("templateId", new ParseUUIDPipe({ version: "4" }))
    templateId: string,
    @Body(new ZodValidationPipe(approveInvitationTemplateSchema))
    input: ApproveInvitationTemplateInput,
  ): Promise<InvitationTemplate> {
    return this.preparation.approveTemplate(
      request.user,
      eventId,
      templateId,
      input,
    );
  }

  @Post(":templateId/archive")
  @HttpCode(HttpStatus.OK)
  public archive(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Param("templateId", new ParseUUIDPipe({ version: "4" }))
    templateId: string,
  ): Promise<InvitationTemplate> {
    return this.preparation.archiveTemplate(request.user, eventId, templateId);
  }
}

@UseGuards(AuthGuard)
@Controller("events/:eventId/preparation")
export class PreparationController {
  public constructor(
    @Inject(PreparationService)
    private readonly preparation: PreparationService,
  ) {}

  @Post("preview")
  @HttpCode(HttpStatus.OK)
  public preview(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Body(new ZodValidationPipe(invitationPreviewRequestSchema))
    input: InvitationPreviewRequest,
  ): Promise<InvitationPreview> {
    return this.preparation.preview(request.user, eventId, input);
  }

  @Get("readiness")
  public readiness(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Query(new ZodValidationPipe(readinessQuerySchema)) query: ReadinessQuery,
  ): Promise<ReadinessResponse> {
    return this.preparation.readiness(request.user, eventId, query);
  }

  @Post("snapshots")
  public snapshots(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Body(new ZodValidationPipe(createPreparationSnapshotsSchema))
    input: CreatePreparationSnapshotsInput,
  ): Promise<CreatePreparationSnapshotsResult> {
    return this.preparation.createSnapshots(request.user, eventId, input);
  }
}
