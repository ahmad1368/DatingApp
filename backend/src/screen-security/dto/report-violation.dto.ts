import { IsIn } from 'class-validator';
import { SCREEN_SECURITY_CONTEXTS, ScreenSecurityContext } from '../screen-security.constants';

export class ReportViolationDto {
  @IsIn(SCREEN_SECURITY_CONTEXTS)
  context!: ScreenSecurityContext;
}
