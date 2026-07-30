// Export centralisé de tous les services
export { playersService } from './playersService';
export { matchesService } from './matchesService';
export { matchRatingsService } from './matchRatingsService';
export { trainingsService } from './trainingsService';
export { teamsService } from './teamsService';
export { matchEventsService } from './matchEventsService';
export { schematicsService } from './schematicsService';
export { sharedContentService } from './sharedContentService';
export type { ContentAnalyticsRow, CreateSharedContentInput } from './sharedContentService';
export { clubsService } from './clubsService';
export type { ClubInvitationRow, ClubTeamRow } from './clubsService';
export {
  createTokensForTraining,
  getFeedbackSessionByToken,
  submitTrainingFeedback,
  getFeedbackLinksForTraining,
  getPlayerTrainingFeedback
} from './trainingFeedbackService';
export type { PlayerTrainingFeedbackRow } from './trainingFeedbackService';
export {
  getMyConvocations,
  setMyTrainingAttendance,
  getMyPendingFeedbackTokens,
  createPlayerLinkCode,
  claimPlayerLinkCode
} from './playerConvocationsService';
export type { MyConvolutionRow, MyPendingFeedbackRow } from './playerConvocationsService';
export {
  reportMyPain,
  reportPainByToken,
  getPlayerPainReports,
  deleteMyPainReport
} from './painReportsService';

